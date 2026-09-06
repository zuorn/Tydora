import {
  DfConnectionPoint,
  DfConnectorPosition,
  type DfDataConnection,
  type DfDataModel,
  type DfDataNode,
} from '@ng-draw-flow/core';
import type { CanvasEdge, CanvasModel, CanvasNode, Port } from '@shared/content-model';

const PORT_TO_POSITION: Record<Port, DfConnectorPosition> = {
  top: DfConnectorPosition.Top,
  right: DfConnectorPosition.Right,
  bottom: DfConnectorPosition.Bottom,
  left: DfConnectorPosition.Left,
};

function toNode(node: CanvasNode): DfDataNode {
  return {
    id: node.id,
    position: { x: node.x + node.width / 2, y: node.y + node.height / 2 },
    data: { type: node.kind, ...node },
  };
}

function toConnection(edge: CanvasEdge): DfDataConnection {
  return {
    source: {
      nodeId: edge.source,
      connectorType: DfConnectionPoint.Output,
      connectorId: `out-${edge.sourcePort}`,
      position: PORT_TO_POSITION[edge.sourcePort],
    },
    target: {
      nodeId: edge.target,
      connectorType: DfConnectionPoint.Input,
      connectorId: `in-${edge.targetPort}`,
      position: PORT_TO_POSITION[edge.targetPort],
    },
    ...(edge.label ? { label: { content: edge.label } } : {}),
  };
}

export function toDrawFlowModel(model: CanvasModel): DfDataModel {
  return {
    nodes: model.nodes.map(toNode),
    connections: model.edges.map(toConnection),
  };
}
