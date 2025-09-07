const jsgraphs = require("js-graph-algorithms");
const PriorityQueue = require("js-priority-queue");

export function maxBottleneckPath(graph, source, target) {
  const V = graph.V;
  const maxCapacity = new Array(V).fill(0);
  maxCapacity[source] = Infinity;

  const predecessor = new Array(V).fill(-1);

  const pq = new PriorityQueue({
    comparator: (a, b) => b.capacity - a.capacity,
  });
  pq.queue({ node: source, capacity: Infinity });

  while (pq.length > 0) {
    const { node, capacity } = pq.dequeue();

    if (node === target) {
      // reconstruct path
      const path = [];
      let current = target;
      while (current !== -1) {
        path.push(current);
        current = predecessor[current];
      }
      path.reverse();
      return { capacity, path };
    }

    graph.adj(node).forEach((edge) => {
      // For directed graph, edges go from edge.from() to edge.to()
      const w = edge.to();
      const edgeCapacity = edge.weight;
      const bottleneck = Math.min(capacity, edgeCapacity);

      if (bottleneck > maxCapacity[w]) {
        maxCapacity[w] = bottleneck;
        predecessor[w] = node;
        pq.queue({ node: w, capacity: bottleneck });
      }
    });
  }

  return { capacity: 0, path: [] }; // no path found
}

// Mock data function - replace with your real data fetching
export function getAllNodes() {
  // Example: return nodes and edges with capacities
  return {
    nodes: [0, 1, 2, 3, 4, 5],
    channels: [
      { from: 0, to: 1, capacity: 10 },
      { from: 0, to: 2, capacity: 5 },
      { from: 1, to: 2, capacity: 7 },
      { from: 1, to: 3, capacity: 8 },
      { from: 2, to: 3, capacity: 4 },
      { from: 3, to: 4, capacity: 10 },
      { from: 4, to: 5, capacity: 6 },
      { from: 2, to: 5, capacity: 2 },
    ],
  };
}

// Send money through the max bottleneck path from source to target
export function sendThroughPath(source, target) {
  const { nodes, channels } = getAllNodes();

  // Create directed weighted graph with number of nodes
  const g = new jsgraphs.WeightedGraph(nodes.length);

  // Add all edges with capacities
  channels.forEach(({ from, to, capacity }) => {
    g.addEdge(new jsgraphs.Edge(from, to, capacity));
  });

  // Find max bottleneck path & capacity
  const result = maxBottleneckPath(g, source, target);

  if (result.capacity === 0) {
    console.log(`No path found from ${source} to ${target}`);
    return;
  }

  console.log(
    `Max bottleneck capacity from ${source} to ${target} is ${result.capacity}`,
  );
  console.log("Path:", result.path);

  // Your logic to send money through the path here
  // For example:
  // sendAmountAlongPath(result.path, result.capacity);

  return result;
}

sendThroughPath(0, 5);

// // Usage example:
// var g = new jsgraphs.WeightedGraph(6);
// g.addEdge(new jsgraphs.Edge(0, 1, 1));
// g.addEdge(new jsgraphs.Edge(0, 2, 5));
// g.addEdge(new jsgraphs.Edge(1, 2, 7));
// g.addEdge(new jsgraphs.Edge(1, 3, 3));
// g.addEdge(new jsgraphs.Edge(2, 3, 4));
// g.addEdge(new jsgraphs.Edge(3, 4, 2));
// g.addEdge(new jsgraphs.Edge(4, 5, 2));
// g.addEdge(new jsgraphs.Edge(2, 5, 5));
//
// const source = 0;
// const target = 5;
//
// console.log(
//   "Max bottleneck capacity from",
//   source,
//   "to",
//   target,
//   "is:",
//   maxBottleneckPath(g, source, target),
// );
