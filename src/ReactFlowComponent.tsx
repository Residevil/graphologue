import React, {
  useCallback,
  BaseSyntheticEvent,
  useEffect,
  MouseEvent,
  useRef,
  useState,
  DragEvent,
} from 'react'
import ReactFlow, {
  useReactFlow,
  useNodesState,
  useEdgesState,
  useKeyPress,
  MiniMap,
  Background,
  SelectionMode,
  NodeTypes,
  EdgeTypes,
  ReactFlowInstance,
  ReactFlowProvider,
  Node,
  Edge,
  Connection,
  EdgeMarker,
  OnConnectStartParams,
  OnConnectStart,
  OnConnectEnd,
  useOnViewportChange,
  Viewport,
} from 'reactflow'
import isEqual from 'react-fast-compare'

import {
  CustomConnectionLine,
  CustomEdge,
  customConnectionLineStyle,
  customEdgeOptions,
  getNewEdge,
} from './components/Edge'
import { customAddNodes, CustomNode, CustomNodeData } from './components/Node'
import { CustomControls } from './components/CustomControl'
import { CustomMarkerDefs } from './components/CustomDefs'
import { Note, NoteBook } from './components/Notebook'
import {
  hardcodedNodeSize,
  styles,
  transitionDuration,
  useTokenDataTransferHandle,
  viewFittingPadding,
} from './constants'
import { FlowContext } from './components/Contexts'
import { getItem, storeItem } from './utils/storage'
import { useTimeMachine } from './utils/timeMachine'
import { roundTo } from './utils/utils'
import { PromptSourceComponentsType } from './utils/magicExplain'
import { MagicNode } from './components/MagicNode'
import { EntityType } from './utils/socket'

const reactFlowWrapperStyle = {
  width: '100%',
  height: '100%',
} as React.CSSProperties

const storedData = getItem()
const defaultNodes = storedData.nodes as Node[]
const defaultEdges = storedData.edges as Edge[]

const nodeTypes = {
  custom: CustomNode,
  magic: MagicNode,
} as NodeTypes

const edgeTypes = {
  custom: CustomEdge,
} as EdgeTypes

const Flow = ({
  setNotes,
  notesOpened,
  setNotesOpened,
}: {
  setNotes: (notes: Note[]) => void
  notesOpened: boolean
  setNotesOpened: (notesOpened: boolean) => void
}) => {
  const thisReactFlowInstance = useReactFlow()
  const {
    setNodes,
    setEdges,
    setViewport,
    addNodes,
    addEdges,
    toObject,
    fitView,
    getViewport,
  }: ReactFlowInstance = thisReactFlowInstance

  // use default nodes and edges
  const [nodes, , onNodesChange] = useNodesState(defaultNodes)
  const [edges, , onEdgesChange] = useEdgesState(defaultEdges)

  // fit to view on page load
  useEffect(() => {
    fitView({
      duration: transitionDuration,
      padding: viewFittingPadding,
    })
  }, [fitView])

  /* -------------------------------------------------------------------------- */
  // ! internal states
  const reactFlowWrapper = useRef(null)

  const [selectedComponents, setSelectedComponents] = useState({
    nodes: [],
    edges: [],
  } as PromptSourceComponentsType)

  const currentConnectingNode = useRef({
    id: '',
    sourceHandleId: '',
  })

  // const anyNodeDragging = useRef(false)
  const { setTime, undoTime, redoTime, canUndo, canRedo } = useTimeMachine(
    toObject(),
    setNodes,
    setEdges,
    setViewport
  )

  // viewport
  const [roughZoomLevel, setRoughZoomLevel] = useState(
    roundTo(getViewport().zoom, 2)
  )
  useOnViewportChange({
    onChange: (v: Viewport) => {
      if (roughZoomLevel !== roundTo(getViewport().zoom, 2))
        setRoughZoomLevel(roundTo(getViewport().zoom, 2))
    },
  })

  /* -------------------------------------------------------------------------- */

  // ! store to session storage and push to time machine
  useEffect(() => {
    const dragging = nodes.find((nd: Node) => nd.dragging)
    if (dragging) return

    // if text editing then don't store
    const editing =
      nodes.find((nd: Node) => nd.data.editing) ||
      edges.find((ed: Edge) => ed.data.editing)
    if (editing) return

    // ! store and save in time machine
    storeItem(toObject(), setTime)

    // ! update selected
    // TODO any more efficient way to do this?
    const selectedNodes = nodes.filter((nd: Node) => nd.selected)
    const selectedEdges = edges.filter((ed: Edge) => ed.selected)
    if (
      !isEqual(selectedComponents.nodes, selectedNodes) ||
      !isEqual(selectedComponents.edges, selectedEdges)
    )
      setSelectedComponents({
        nodes: selectedNodes,
        edges: selectedEdges,
      })
  }, [nodes, edges, toObject, setTime, selectedComponents])

  // ! keys
  const metaPressed = useKeyPress(['Ctrl', 'Alt'])
  // const undoPressed = useKeyPress('Meta+z')
  // const redoPressed = useKeyPress('Meta+x')

  // useEffect(() => {
  //   if (undoPressed && canUndo) undoTime()
  // }, [undoPressed, canUndo, undoTime])

  // useEffect(() => {
  //   if (redoPressed && canRedo) redoTime()
  // }, [redoPressed, canRedo, redoTime])

  // ! on connect
  const onConnect = useCallback(
    (params: Connection) => {
      addEdges(
        // overwrite default edge configs here
        getNewEdge(params)
      )
    },
    [addEdges]
  )

  /* -------------------------------------------------------------------------- */
  // ! node

  // node - set editing status
  const doSetNodesEditing = useCallback(
    (nodeIds: string[], editing: boolean) => {
      setNodes((nds: Node[]) => {
        return nds.map((nd: Node) => {
          if (!nodeIds.includes(nd.id) || nd.type !== 'custom') return nd
          else {
            return {
              ...nd,
              data: {
                ...nd.data,
                editing,
              },
            }
          }
        })
      })
    },
    [setNodes]
  )

  // ! node right click
  const handleNodeContextMenu = useCallback((e: BaseSyntheticEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleNodeDoubleClick = useCallback(
    (e: BaseSyntheticEvent, node: Node) => {
      e.preventDefault()
      e.stopPropagation()

      if (node.type === 'custom') doSetNodesEditing([node.id], true)
    },
    [doSetNodesEditing]
  )

  const handleNodeDragStart = useCallback(() => {
    // anyNodeDragging.current = true
  }, [])

  const handleNodeDragStop = useCallback(() => {
    // anyNodeDragging.current = false
  }, [])

  /* -------------------------------------------------------------------------- */

  // ! drag and drop from tokens

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()

      const token = JSON.parse(
        e.dataTransfer.getData(`application/${useTokenDataTransferHandle}`)
      ) as EntityType

      // check if the dropped element is valid
      if (typeof token === 'undefined' || !token || !token.value) {
        return
      }

      const position = thisReactFlowInstance.project({
        x: e.clientX,
        y: e.clientY,
      })

      // add by drop tokens
      customAddNodes(
        addNodes,
        position.x - hardcodedNodeSize.width / 2,
        position.y - hardcodedNodeSize.height / 2,
        {
          label: `${token.value}`,
          editing: false,
          toFitView: false,
          fitView: undefined,
        }
      )
    },
    [addNodes, thisReactFlowInstance]
  )

  /* -------------------------------------------------------------------------- */
  // ! edge

  // build new nodes on drag out
  const onConnectStart = useCallback(
    (_: MouseEvent, { nodeId, handleId }: OnConnectStartParams) => {
      currentConnectingNode.current.id = nodeId || ''
      currentConnectingNode.current.sourceHandleId = handleId || ''
    },
    []
  )

  const onConnectEnd = useCallback(
    (event: any) => {
      const targetIsPane = (event.target as HTMLElement).classList.contains(
        'react-flow__pane'
      )

      // ! drop to an empty space
      if (targetIsPane && reactFlowWrapper.current) {
        // we need to remove the wrapper bounds, in order to get the correct position
        const { top, left } = (
          reactFlowWrapper.current as HTMLElement
        ).getBoundingClientRect()
        const { x, y, zoom } = getViewport()
        const { width: nodeWidth, height: nodeHeight } = hardcodedNodeSize

        // add by drop edge
        const { nodeId, targetHandleId } = customAddNodes(
          addNodes,
          event.clientX / zoom - left - x / zoom - nodeWidth / 2,
          event.clientY / zoom - top - y / zoom - nodeHeight / 2,
          {
            label: '',
            editing: false,
            toFitView: false,
            fitView: fitView,
          }
        )
        setEdges(eds =>
          eds.concat(
            getNewEdge({
              source: currentConnectingNode.current.id,
              sourceHandle: currentConnectingNode.current.sourceHandleId,
              target: nodeId,
              targetHandle: targetHandleId,
            })
          )
        )

        // setTimeout(() => {
        //   doSetNodeEditing([nodeId], true)
        // }, 50)
      }
    },
    [addNodes, setEdges, getViewport, fitView]
  )

  const doSetEdgesEditing = useCallback(
    (edgeIds: string[], editing: boolean) => {
      setEdges((eds: Edge[]) => {
        return eds.map((ed: Edge) => {
          if (!edgeIds.includes(ed.id)) return ed
          else {
            return {
              ...ed,
              data: {
                ...ed.data,
                editing,
              },
            }
          }
        })
      })
    },
    [setEdges]
  )

  const handleEdgeDoubleClick = useCallback(
    (e: BaseSyntheticEvent, edge: Edge) => {
      e.preventDefault()
      e.stopPropagation()

      setEdges((nds: Edge[]) => {
        return nds.map((nd: Edge) => {
          if (edge.id !== nd.id) return nd
          else {
            return {
              ...nd,
              data: {
                ...nd.data,
                editing: true,
              },
            }
          }
        })
      })
    },
    [setEdges]
  )

  /* -------------------------------------------------------------------------- */
  // ! pane

  const handlePaneClick = useCallback(() => {
    setNodes((nds: Node[]) => {
      return nds.map((nd: Node) => {
        if (!nd.data.editing || nd.type !== 'custom') return nd
        return {
          ...nd,
          data: {
            ...nd.data,
            editing: false,
          } as CustomNodeData,
        } as Node
      })
    })
  }, [setNodes])

  // const handlePaneContextMenu = useCallback((e: BaseSyntheticEvent) => {
  //   e.preventDefault()
  //   e.stopPropagation()
  // }, [])

  /* -------------------------------------------------------------------------- */
  // ! other rendering related

  // none

  return (
    <FlowContext.Provider
      value={{
        metaPressed,
        selectedComponents: selectedComponents,
        doSetNodesEditing,
        doSetEdgesEditing,
      }}
    >
      <div id="react-flow-wrapper" ref={reactFlowWrapper}>
        <ReactFlow
          className={metaPressed ? 'flow-meta-pressed' : ''}
          // basic
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectStart={onConnectStart as OnConnectStart}
          onConnectEnd={onConnectEnd as OnConnectEnd}
          // flow view
          style={reactFlowWrapperStyle}
          fitView={false}
          attributionPosition="top-right"
          // edge specs
          elevateEdgesOnSelect={false}
          defaultEdgeOptions={customEdgeOptions} // adding a new edge with this configs without notice
          connectionLineComponent={CustomConnectionLine}
          connectionLineStyle={customConnectionLineStyle}
          // viewport control
          panOnScroll={true}
          selectionOnDrag={true}
          panOnDrag={[1, 2]}
          selectionMode={SelectionMode.Partial}
          // ! actions
          onNodeDoubleClick={handleNodeDoubleClick}
          onNodeContextMenu={handleNodeContextMenu}
          onNodeDragStart={handleNodeDragStart}
          onNodeDragStop={handleNodeDragStop}
          onEdgeDoubleClick={handleEdgeDoubleClick}
          onPaneClick={handlePaneClick}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          // onPaneContextMenu={handlePaneContextMenu}
        >
          <CustomMarkerDefs
            markerOptions={
              {
                color: styles.edgeColorStrokeSelected,
              } as EdgeMarker
            }
          />
          <CustomMarkerDefs
            markerOptions={
              {
                color: styles.edgeColorStrokeExplained,
              } as EdgeMarker
            }
          />
          <MiniMap
            position={'bottom-left'}
            pannable={true}
            // nodeStrokeColor={n => {
            //   if (n.selected) return styles.edgeColorStrokeSelected
            //   else return 'none'
            // }}
            nodeColor={n => {
              if (n.data.editing) return `#ff06b7aa`
              else if (n.selected) {
                if (n.type === 'magic')
                  return `${styles.edgeColorStrokeExplained}aa`
                else return `${styles.edgeColorStrokeSelected}aa`
              } else return '#cfcfcf'
            }}
            // nodeStrokeColor={n => {
            //   if (n.type === 'magic') return `#${`57068c`}99`
            //   else return 'none'
            // }}
          />
          <CustomControls
            nodes={nodes}
            edges={edges}
            selectedComponents={selectedComponents}
            undoTime={undoTime}
            redoTime={redoTime}
            canUndo={canUndo}
            canRedo={canRedo}
            notesOpened={notesOpened}
            setNotesOpened={setNotesOpened}
          />
          <Background color="#008ddf" />
        </ReactFlow>
      </div>
    </FlowContext.Provider>
  )
}

const ReactFlowComponent = () => {
  const [notes, setNotes] = useState<Note[]>([])
  const [notesOpened, setNotesOpened] = useState<boolean>(false)

  return (
    <ReactFlowProvider>
      <Flow
        setNotes={setNotes}
        notesOpened={notesOpened}
        setNotesOpened={setNotesOpened}
      />
      <NoteBook
        notes={notes}
        setNotes={setNotes}
        notesOpened={notesOpened}
        setNotesOpened={setNotesOpened}
      />
    </ReactFlowProvider>
  )
}

export default ReactFlowComponent
