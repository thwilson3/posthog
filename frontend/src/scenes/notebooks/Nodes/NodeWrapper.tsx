import {
    Node,
    NodeViewWrapper,
    mergeAttributes,
    ReactNodeViewRenderer,
    ExtendedRegExpMatchArray,
    Attribute,
    NodeViewProps,
    getExtensionField,
} from '@tiptap/react'
import { ReactNode, useCallback, useRef } from 'react'
import clsx from 'clsx'
import {
    IconClose,
    IconDragHandle,
    IconFilter,
    IconLink,
    IconPlusMini,
    IconUnfoldLess,
    IconUnfoldMore,
} from 'lib/lemon-ui/icons'
import { LemonButton } from '@posthog/lemon-ui'
import './NodeWrapper.scss'
import { LemonSkeleton } from 'lib/lemon-ui/LemonSkeleton'
import { BindLogic, useActions, useMountedLogic, useValues } from 'kea'
import { notebookLogic } from '../Notebook/notebookLogic'
import { useInView } from 'react-intersection-observer'
import { NotebookNodeType } from '~/types'
import { ErrorBoundary } from '~/layout/ErrorBoundary'
import { NotebookNodeContext, NotebookNodeLogicProps, notebookNodeLogic } from './notebookNodeLogic'
import { posthogNodePasteRule, useSyncedAttributes } from './utils'
import {
    NotebookNodeAttributes,
    NotebookNodeViewProps,
    NotebookNodeWidget,
    CustomNotebookNodeAttributes,
} from '../Notebook/utils'

export interface NodeWrapperProps<T extends CustomNotebookNodeAttributes> {
    nodeType: NotebookNodeType
    children?: ReactNode | ((isEdit: boolean, isPreview: boolean) => ReactNode)

    // Meta properties - these should never be too advanced - more advanced should be done via updateAttributes in the component
    defaultTitle: string
    href?: string | ((attributes: NotebookNodeAttributes<T>) => string | undefined)

    // Sizing
    expandable?: boolean
    startExpanded?: boolean
    resizeable?: boolean | ((attributes: CustomNotebookNodeAttributes) => boolean)
    heightEstimate?: number | string
    minHeight?: number | string
    /** If true the metadata area will only show when hovered if in editing mode */
    autoHideMetadata?: boolean
    /** Expand the node if the component is clicked */
    expandOnClick?: boolean
    widgets?: NotebookNodeWidget[]
}

function NodeWrapper<T extends CustomNotebookNodeAttributes>({
    defaultTitle,
    nodeType,
    children,
    selected,
    href,
    heightEstimate = '4rem',
    resizeable: resizeableOrGenerator = true,
    startExpanded = false,
    expandable = true,
    expandOnClick = true,
    autoHideMetadata = false,
    minHeight,
    node,
    getPos,
    attributes,
    updateAttributes,
    widgets = [],
}: NodeWrapperProps<T> & NotebookNodeViewProps<T>): JSX.Element {
    const mountedNotebookLogic = useMountedLogic(notebookLogic)
    const { isEditable, editingNodeId } = useValues(notebookLogic)
    const { setEditingNodeId } = useActions(notebookLogic)

    // nodeId can start null, but should then immediately be generated
    const nodeId = attributes.nodeId
    const nodeLogicProps: NotebookNodeLogicProps = {
        node,
        nodeType,
        attributes,
        updateAttributes,
        nodeId,
        notebookLogic: mountedNotebookLogic,
        getPos,
        resizeable: resizeableOrGenerator,
        widgets,
        startExpanded,
    }
    const nodeLogic = useMountedLogic(notebookNodeLogic(nodeLogicProps))
    const { resizeable, expanded, actions } = useValues(nodeLogic)
    const { setExpanded, deleteNode } = useActions(nodeLogic)

    const [ref, inView] = useInView({ triggerOnce: true })
    const contentRef = useRef<HTMLDivElement | null>(null)

    // If resizeable is true then the node attr "height" is required
    const height = attributes.height ?? heightEstimate

    const onResizeStart = useCallback((): void => {
        if (!resizeable) {
            return
        }
        const initialHeightAttr = contentRef.current?.style.height
        const onResizedEnd = (): void => {
            window.removeEventListener('mouseup', onResizedEnd)
            // css resize sets the style attr so we check that to detect changes. Resize obsserver doesn't trigger for style changes
            const heightAttr = contentRef.current?.style.height
            if (heightAttr && heightAttr !== initialHeightAttr) {
                updateAttributes({
                    height: contentRef.current?.clientHeight,
                } as any)
            }
        }

        window.addEventListener('mouseup', onResizedEnd)
    }, [resizeable, updateAttributes])

    const parsedHref = typeof href === 'function' ? href(attributes) : href
    // If a title is set on the attrs we use it. Otherwise we use the base component title.
    const title = attributes.title ? attributes.title : defaultTitle

    // Element is resizable if resizable is set to true. If expandable is set to true then is is only resizable if expanded is true
    const isResizeable = resizeable && (!expandable || expanded)

    return (
        <NotebookNodeContext.Provider value={nodeLogic}>
            <BindLogic logic={notebookNodeLogic} props={nodeLogicProps}>
                <NodeViewWrapper as="div">
                    <div
                        ref={ref}
                        className={clsx(nodeType, 'NotebookNode', {
                            'NotebookNode--selected': isEditable && selected,
                            'NotebookNode--auto-hide-metadata': autoHideMetadata,
                        })}
                    >
                        <div className="NotebookNode__box">
                            <ErrorBoundary>
                                {!inView ? (
                                    <>
                                        <div className="h-4" /> {/* Placeholder for the drag handle */}
                                        {/* eslint-disable-next-line react/forbid-dom-props */}
                                        <div style={{ height: heightEstimate }}>
                                            <LemonSkeleton className="h-full" />
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="NotebookNode__meta" data-drag-handle>
                                            <LemonButton
                                                onClick={() => setExpanded(!expanded)}
                                                size="small"
                                                status="primary-alt"
                                                className="flex-1"
                                                icon={
                                                    isEditable ? (
                                                        <IconDragHandle className="cursor-move text-base shrink-0" />
                                                    ) : undefined
                                                }
                                            >
                                                <span className="flex-1 cursor-pointer">{title}</span>
                                            </LemonButton>

                                            <div className="flex space-x-1">
                                                {parsedHref && (
                                                    <LemonButton size="small" icon={<IconLink />} to={parsedHref} />
                                                )}

                                                {expandable && (
                                                    <LemonButton
                                                        onClick={() => setExpanded(!expanded)}
                                                        size="small"
                                                        icon={expanded ? <IconUnfoldLess /> : <IconUnfoldMore />}
                                                    />
                                                )}

                                                {isEditable ? (
                                                    <>
                                                        {widgets.length > 0 ? (
                                                            <LemonButton
                                                                onClick={() =>
                                                                    setEditingNodeId(
                                                                        editingNodeId === nodeId ? null : nodeId
                                                                    )
                                                                }
                                                                size="small"
                                                                icon={<IconFilter />}
                                                                active={editingNodeId === nodeId}
                                                            />
                                                        ) : null}

                                                        <LemonButton
                                                            onClick={() => deleteNode()}
                                                            size="small"
                                                            status="danger"
                                                            icon={<IconClose />}
                                                        />
                                                    </>
                                                ) : null}
                                            </div>
                                        </div>
                                        <div
                                            ref={contentRef}
                                            className={clsx(
                                                'NotebookNode__content flex flex-col relative z-0 overflow-hidden',
                                                isEditable && isResizeable && 'resize-y'
                                            )}
                                            // eslint-disable-next-line react/forbid-dom-props
                                            style={isResizeable ? { height, minHeight } : {}}
                                            onClick={!expanded && expandOnClick ? () => setExpanded(true) : undefined}
                                            onMouseDown={onResizeStart}
                                        >
                                            {children}
                                        </div>
                                    </>
                                )}
                            </ErrorBoundary>
                        </div>
                        {isEditable && actions.length ? (
                            <div className="NotebookNode__actions">
                                {actions.map((x, i) => (
                                    <LemonButton
                                        key={i}
                                        type="secondary"
                                        status="primary"
                                        size="small"
                                        icon={x.icon ?? <IconPlusMini />}
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            x.onClick()
                                        }}
                                    >
                                        {x.text}
                                    </LemonButton>
                                ))}
                            </div>
                        ) : null}
                    </div>
                </NodeViewWrapper>
            </BindLogic>
        </NotebookNodeContext.Provider>
    )
}

// const MemoizedNodeWrapper = memo(NodeWrapper) as typeof NodeWrapper

export type CreatePostHogWidgetNodeOptions<T extends CustomNotebookNodeAttributes> = NodeWrapperProps<T> & {
    nodeType: NotebookNodeType
    Component: (props: NotebookNodeViewProps<T>) => JSX.Element | null
    pasteOptions?: {
        find: string
        getAttributes: (match: ExtendedRegExpMatchArray) => Promise<T | null | undefined> | T | null | undefined
    }
    attributes: Record<keyof T, Partial<Attribute>>
    widgets?: NotebookNodeWidget[]
    serializedText?: (attributes: NotebookNodeAttributes<T>) => string
}

export function createPostHogWidgetNode<T extends CustomNotebookNodeAttributes>({
    Component,
    pasteOptions,
    attributes,
    serializedText,
    ...wrapperProps
}: CreatePostHogWidgetNodeOptions<T>): Node {
    // NOTE: We use NodeViewProps here as we convert them to NotebookNodeViewProps
    const WrappedComponent = (props: NodeViewProps): JSX.Element => {
        const [attributes, updateAttributes] = useSyncedAttributes<T>(props)

        if (props.node.attrs.nodeId === null) {
            // TODO only wrapped in setTimeout because of the flushSync bug
            setTimeout(() => {
                props.updateAttributes({
                    nodeId: attributes.nodeId,
                })
            }, 0)
        }

        const nodeProps: NotebookNodeViewProps<T> = {
            ...props,
            attributes,
            updateAttributes,
        }

        return (
            <NodeWrapper {...nodeProps} {...wrapperProps}>
                <Component {...nodeProps} />
            </NodeWrapper>
        )
    }

    return Node.create({
        name: wrapperProps.nodeType,
        group: 'block',
        atom: true,
        draggable: true,

        serializedText: serializedText,

        extendNodeSchema(extension) {
            const context = {
                name: extension.name,
                options: extension.options,
                storage: extension.storage,
            }
            return {
                serializedText: getExtensionField(extension, 'serializedText', context),
            }
        },

        addAttributes() {
            return {
                height: {},
                title: {},
                nodeId: {
                    default: null,
                },
                ...attributes,
            }
        },

        parseHTML() {
            return [
                {
                    tag: wrapperProps.nodeType,
                },
            ]
        },

        renderHTML({ HTMLAttributes }) {
            return [wrapperProps.nodeType, mergeAttributes(HTMLAttributes)]
        },

        addNodeView() {
            return ReactNodeViewRenderer(WrappedComponent)
        },

        addPasteRules() {
            return pasteOptions
                ? [
                      posthogNodePasteRule({
                          editor: this.editor,
                          type: this.type,
                          ...pasteOptions,
                      }),
                  ]
                : []
        },
    })
}
