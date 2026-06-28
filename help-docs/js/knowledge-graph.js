/**
 * Knowledge Graph - D3.js force-directed graph for mkdocs-material
 * Uses graph data embedded in each page by the wiki_links hook
 */
(function () {
  'use strict';

  let svg, g, simulation, nodesData, linksData;

  function getCurrentPageId() {
    let path = window.location.pathname;
    path = path.replace(/^\/+|\/+$/g, '').replace(/\/index\.html$/, '').replace(/\.html$/, '');
    if (path === '' || path === 'index') return '_index';
    return path;
  }

  function isDarkMode() {
    return document.body.getAttribute('data-md-color-scheme') === 'slate';
  }

  function createContainer() {
    const tocSidebar = document.querySelector('.md-sidebar--secondary .md-sidebar__scrollwrap');
    if (!tocSidebar) return null;

    let container = document.getElementById('knowledge-graph');
    if (container) return container;

    container = document.createElement('div');
    container.id = 'knowledge-graph';

    const toggle = document.createElement('div');
    toggle.className = 'kg-toggle';
    toggle.innerHTML = '<span>知识图谱</span><span class="kg-toggle-arrow">\u25BC</span>';
    container.appendChild(toggle);

    const graphWrapper = document.createElement('div');
    graphWrapper.className = 'kg-graph-wrapper';
    graphWrapper.style.height = '300px';
    graphWrapper.style.overflow = 'hidden';
    container.appendChild(graphWrapper);

    let tooltip = document.getElementById('kg-tooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'kg-tooltip';
      document.body.appendChild(tooltip);
    }

    toggle.addEventListener('click', function () {
      this.classList.toggle('collapsed');
      graphWrapper.style.display = this.classList.contains('collapsed') ? 'none' : 'block';
    });

    const firstChild = tocSidebar.firstElementChild;
    if (firstChild) {
      tocSidebar.insertBefore(container, firstChild);
    } else {
      tocSidebar.appendChild(container);
    }

    return container;
  }

  function init() {
    // Wait for sidebar and D3 to be ready
    const checkReady = setInterval(function () {
      const tocSidebar = document.querySelector('.md-sidebar--secondary .md-sidebar__scrollwrap');
      if (tocSidebar && typeof d3 !== 'undefined' && window.__GRAPH_DATA__) {
        clearInterval(checkReady);
        startGraph();
      }
    }, 100);

    setTimeout(function () { clearInterval(checkReady); }, 5000);
  }

  function startGraph() {
    const data = window.__GRAPH_DATA__;
    if (!data || !data.nodes || !data.nodes.length) {
      console.log('[Knowledge Graph] No graph data found');
      return;
    }

    const container = createContainer();
    if (!container) return;

    const graphWrapper = container.querySelector('.kg-graph-wrapper');
    const width = graphWrapper.clientWidth || 280;
    const height = 300;

    svg = d3.select(graphWrapper)
      .append('svg')
      .attr('width', '100%')
      .attr('height', height)
      .attr('viewBox', '0 0 ' + width + ' ' + height);

    const zoomBehavior = d3.zoom()
      .scaleExtent([0.3, 3])
      .on('zoom', function (event) {
        g.attr('transform', event.transform);
      });
    svg.call(zoomBehavior);

    g = svg.append('g');

    render(data, width, height, zoomBehavior);
  }

  function render(data, width, height, zoomBehavior) {
    nodesData = data.nodes.map(function (n) { return Object.assign({}, n); });
    linksData = data.links.map(function (l) { return { source: l.source, target: l.target }; });

    var currentNodeId = getCurrentPageId();

    // Color scheme like the app (schemeTableau10)
    var groups = [];
    var seen = {};
    nodesData.forEach(function (n) {
      if (!seen[n.group]) {
        groups.push(n.group);
        seen[n.group] = true;
      }
    });
    var colorScale = d3.scaleOrdinal(d3.schemeTableau10).domain(groups);

    // Pre-calculate link counts
    var inboundCount = {};
    linksData.forEach(function (l) {
      var tid = typeof l.target === 'object' ? l.target.id : l.target;
      inboundCount[tid] = (inboundCount[tid] || 0) + 1;
    });

    var maxLinks = Math.max.apply(null, [1].concat(nodesData.map(function (n) { return inboundCount[n.id] || 0; })));
    var radiusFn = function (d) {
      if (d.id === currentNodeId) return 8;
      return 3 + ((inboundCount[d.id] || 0) / maxLinks) * 7;
    };

    // Circular initial layout
    var initRadius = Math.max(60, Math.min(120, nodesData.length * 3));
    nodesData.forEach(function (n, i) {
      var angle = (2 * Math.PI * i) / nodesData.length;
      n.x = width / 2 + initRadius * Math.cos(angle);
      n.y = height / 2 + initRadius * Math.sin(angle);
    });

    simulation = d3.forceSimulation(nodesData)
      .force('link', d3.forceLink(linksData).id(function (d) { return d.id; }).distance(50))
      .force('charge', d3.forceManyBody().strength(-80).distanceMax(200))
      .force('center', d3.forceCenter(width / 2, height / 2).strength(0.1))
      .force('collision', d3.forceCollide(20))
      .force('x', d3.forceX(width / 2).strength(0.06))
      .force('y', d3.forceY(height / 2).strength(0.06));

    var strokeColor = isDarkMode() ? '#45475a' : '#ccc';
    var textColor = isDarkMode() ? '#cdd6f4' : '#333';
    var bgColor = isDarkMode() ? '#1e1e2e' : '#fff';

    var link = g.append('g')
      .attr('class', 'kg-links')
      .selectAll('line')
      .data(linksData)
      .join('line')
      .attr('stroke', strokeColor)
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.5);

    var node = g.append('g')
      .attr('class', 'kg-nodes')
      .selectAll('g')
      .data(nodesData)
      .join('g')
      .attr('class', 'kg-node')
      .style('cursor', 'pointer')
      .call(d3.drag()
        .on('start', function (event, d) {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', function (event, d) {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', function (event, d) {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        })
      );

    node.append('circle')
      .attr('r', radiusFn)
      .attr('fill', function (d) {
        if (d.id === currentNodeId) return '#ef5350';
        return colorScale(d.group);
      })
      .attr('stroke', bgColor)
      .attr('stroke-width', 1.5);

    node.append('text')
      .attr('x', function (d) { return radiusFn(d) + 4; })
      .attr('y', 4)
      .attr('font-size', '10px')
      .attr('fill', textColor)
      .text(function (d) { return d.label; })
      .style('pointer-events', 'none');

    // Hover
    node.on('mouseover', function (event, d) {
      var connected = {};
      connected[d.id] = true;
      linksData.forEach(function (l) {
        var sid = typeof l.source === 'object' ? l.source.id : l.source;
        var tid = typeof l.target === 'object' ? l.target.id : l.target;
        if (sid === d.id) connected[tid] = true;
        if (tid === d.id) connected[sid] = true;
      });

      node.style('opacity', function (n) { return connected[n.id] ? 1 : 0.15; });
      link.style('opacity', function (l) {
        var sid = typeof l.source === 'object' ? l.source.id : l.source;
        var tid = typeof l.target === 'object' ? l.target.id : l.target;
        return (sid === d.id || tid === d.id) ? 1 : 0.05;
      });

      var tooltip = document.getElementById('kg-tooltip');
      if (tooltip) {
        var links = inboundCount[d.id] || 0;
        tooltip.innerHTML = '<div class="kg-tooltip-name">' + d.label + '</div><div class="kg-tooltip-meta">' + links + ' links</div>';
        tooltip.style.display = 'block';
        tooltip.style.left = (event.pageX + 14) + 'px';
        tooltip.style.top = (event.pageY - 10) + 'px';
      }
    })
      .on('mousemove', function (event) {
        var tooltip = document.getElementById('kg-tooltip');
        if (tooltip) {
          tooltip.style.left = (event.pageX + 14) + 'px';
          tooltip.style.top = (event.pageY - 10) + 'px';
        }
      })
      .on('mouseout', function () {
        node.style('opacity', 1);
        link.style('opacity', 0.5);
        var tooltip = document.getElementById('kg-tooltip');
        if (tooltip) tooltip.style.display = 'none';
      })
      .on('click', function (event, d) {
        if (d.id !== currentNodeId) {
          var links = document.querySelectorAll('a[href]');
          for (var i = 0; i < links.length; i++) {
            var href = links[i].getAttribute('href');
            if (href && href.indexOf(d.id) !== -1) {
              window.location.href = links[i].href;
              return;
            }
          }
          window.location.href = '../' + d.id + '/';
        }
      });

    simulation.on('tick', function () {
      link
        .attr('x1', function (d) { return d.source.x; })
        .attr('y1', function (d) { return d.source.y; })
        .attr('x2', function (d) { return d.target.x; })
        .attr('y2', function (d) { return d.target.y; });
      node.attr('transform', function (d) { return 'translate(' + d.x + ',' + d.y + ')'; });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
