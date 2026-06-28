/**
 * Knowledge Graph - D3.js force-directed graph for mkdocs-material
 * Uses graph data embedded in each page by the wiki_links hook
 */
(function () {
  'use strict';

  var svg, g, simulation, nodesData, linksData;

  function getCurrentPageId() {
    var path = window.location.pathname;
    path = path.replace(/^\/+|\/+$/g, '').replace(/\/index\.html$/, '').replace(/\.html$/, '');
    if (path === '' || path === 'index') return '_index';
    return path;
  }

  function isDarkMode() {
    return document.body.getAttribute('data-md-color-scheme') === 'slate';
  }

  function navigateToNode(nodeId) {
    var currentNodeId = getCurrentPageId();
    if (nodeId === currentNodeId) return;

    var links = document.querySelectorAll('a[href]');
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute('href');
      if (href && href.indexOf(encodeURIComponent(nodeId)) !== -1) {
        window.location.href = links[i].href;
        return;
      }
    }
    var parts = nodeId.split('/');
    var encoded = parts.map(function(p) { return encodeURIComponent(p); }).join('/');
    var depth = currentNodeId.split('/').length - 1;
    var prefix = depth > 0 ? '../'.repeat(depth) : './';
    window.location.href = prefix + encoded + '/';
  }

  function createContainer() {
    var tocSidebar = document.querySelector('.md-sidebar--secondary .md-sidebar__scrollwrap');
    if (!tocSidebar) return null;

    var container = document.getElementById('knowledge-graph');
    if (container) return container;

    container = document.createElement('div');
    container.id = 'knowledge-graph';

    // Expand button (top-right corner)
    var expandBtn = document.createElement('button');
    expandBtn.className = 'kg-expand-btn';
    expandBtn.title = '全屏查看';
    expandBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="3"/><circle cx="4" cy="19" r="3"/><circle cx="20" cy="19" r="3"/><line x1="9.5" y1="6.5" x2="5.5" y2="16.5"/><line x1="14.5" y1="6.5" x2="18.5" y2="16.5"/><line x1="7" y1="19" x2="17" y2="19"/></svg>';
    expandBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      openModal();
    });
    container.appendChild(expandBtn);

    var graphWrapper = document.createElement('div');
    graphWrapper.className = 'kg-graph-wrapper';
    graphWrapper.style.width = '100%';
    graphWrapper.style.height = '100%';
    graphWrapper.style.overflow = 'hidden';
    container.appendChild(graphWrapper);

    var tooltip = document.getElementById('kg-tooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'kg-tooltip';
      document.body.appendChild(tooltip);
    }

    var firstChild = tocSidebar.firstElementChild;
    if (firstChild) {
      tocSidebar.insertBefore(container, firstChild);
    } else {
      tocSidebar.appendChild(container);
    }

    return container;
  }

  function fitToViewport(nodes, width, height, svg, zoomBehavior) {
    if (!nodes.length) return;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.x != null && n.y != null) {
        if (n.x < minX) minX = n.x;
        if (n.y < minY) minY = n.y;
        if (n.x > maxX) maxX = n.x;
        if (n.y > maxY) maxY = n.y;
      }
    }
    var padding = 60;
    var graphW = maxX - minX + padding * 2;
    var graphH = maxY - minY + padding * 2;
    var scale = Math.min(width / graphW, height / graphH);
    var cx = (minX + maxX) / 2;
    var cy = (minY + maxY) / 2;
    var tx = width / 2 - cx * scale;
    var ty = height / 2 - cy * scale;
    svg.transition().duration(500).call(
      zoomBehavior.transform,
      d3.zoomIdentity.translate(tx, ty).scale(scale)
    );
  }

  function renderGraph(svgElement, width, height, isModal) {
    var data = window.__GRAPH_DATA__;
    if (!data || !data.nodes || !data.nodes.length) return null;

    var nodes = data.nodes.map(function (n) { return Object.assign({}, n); });
    var links = data.links.map(function (l) { return { source: l.source, target: l.target }; });

    var currentNodeId = getCurrentPageId();

    var groups = [];
    var seen = {};
    nodes.forEach(function (n) {
      if (!seen[n.group]) {
        groups.push(n.group);
        seen[n.group] = true;
      }
    });
    var colorScale = d3.scaleOrdinal(d3.schemeTableau10).domain(groups);

    var inboundCount = {};
    links.forEach(function (l) {
      var tid = typeof l.target === 'object' ? l.target.id : l.target;
      inboundCount[tid] = (inboundCount[tid] || 0) + 1;
    });

    var maxLinks = Math.max.apply(null, [1].concat(nodes.map(function (n) { return inboundCount[n.id] || 0; })));
    var radiusFn = function (d) {
      if (d.id === currentNodeId) return 8;
      return 3 + ((inboundCount[d.id] || 0) / maxLinks) * 7;
    };

    var initRadius = isModal ? Math.max(150, Math.min(300, nodes.length * 8)) : Math.max(80, Math.min(180, nodes.length * 4));
    nodes.forEach(function (n, i) {
      var angle = (2 * Math.PI * i) / nodes.length;
      n.x = width / 2 + initRadius * Math.cos(angle);
      n.y = height / 2 + initRadius * Math.sin(angle);
    });

    var sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(function (d) { return d.id; }).distance(isModal ? 120 : 50))
      .force('charge', d3.forceManyBody().strength(isModal ? -300 : -80).distanceMax(isModal ? 500 : 200))
      .force('center', d3.forceCenter(width / 2, height / 2).strength(0.05))
      .force('collision', d3.forceCollide(isModal ? 40 : 20))
      .force('x', d3.forceX(width / 2).strength(isModal ? 0.03 : 0.06))
      .force('y', d3.forceY(height / 2).strength(isModal ? 0.03 : 0.06));

    var svg = d3.select(svgElement);
    svg.selectAll('*').remove();

    var g = svg.append('g');

    var zoomBehavior = d3.zoom()
      .scaleExtent([0.2, 4])
      .on('zoom', function (event) {
        g.attr('transform', event.transform);
      });
    svg.call(zoomBehavior);

    var strokeColor = isDarkMode() ? '#45475a' : '#ccc';
    var textColor = isDarkMode() ? '#cdd6f4' : '#333';
    var bgColor = isDarkMode() ? '#1e1e2e' : '#fff';

    var link = g.append('g')
      .attr('class', 'kg-links')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', strokeColor)
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.5);

    var node = g.append('g')
      .attr('class', 'kg-nodes')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .attr('class', 'kg-node')
      .style('cursor', 'pointer')
      .call(d3.drag()
        .on('start', function (event, d) {
          if (!event.active) sim.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', function (event, d) {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', function (event, d) {
          if (!event.active) sim.alphaTarget(0);
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
      .attr('font-size', isModal ? '11px' : '10px')
      .attr('fill', textColor)
      .text(function (d) { return d.label; })
      .style('pointer-events', 'none');

    node.on('mouseover', function (event, d) {
      var connected = {};
      connected[d.id] = true;
      links.forEach(function (l) {
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
        var linkCount = inboundCount[d.id] || 0;
        tooltip.innerHTML = '<div class="kg-tooltip-name">' + d.label + '</div><div class="kg-tooltip-meta">' + linkCount + ' links</div>';
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
        navigateToNode(d.id);
      });

    var tickCount = 0;
    sim.on('tick', function () {
      link
        .attr('x1', function (d) { return d.source.x; })
        .attr('y1', function (d) { return d.source.y; })
        .attr('x2', function (d) { return d.target.x; })
        .attr('y2', function (d) { return d.target.y; });
      node.attr('transform', function (d) { return 'translate(' + d.x + ',' + d.y + ')'; });

      // Auto-fit after a few ticks (modal only)
      if (isModal) {
        tickCount++;
        if (tickCount === 5) {
          fitToViewport(nodes, width, height, svg, zoomBehavior);
        }
      }
    });

    return sim;
  }

  function startGraph() {
    var data = window.__GRAPH_DATA__;
    if (!data || !data.nodes || !data.nodes.length) return;

    var container = createContainer();
    if (!container) return;

    var graphWrapper = container.querySelector('.kg-graph-wrapper');
    var width = graphWrapper.clientWidth || 280;
    var height = 300;

    graphWrapper.innerHTML = '';

    var svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgEl.setAttribute('width', '100%');
    svgEl.setAttribute('height', height);
    svgEl.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    graphWrapper.appendChild(svgEl);

    renderGraph(svgEl, width, height, false);
  }

  function openModal() {
    if (document.getElementById('kg-modal')) return;

    var data = window.__GRAPH_DATA__;
    if (!data || !data.nodes || !data.nodes.length) return;

    var modal = document.createElement('div');
    modal.id = 'kg-modal';
    modal.className = 'kg-modal';

    var backdrop = document.createElement('div');
    backdrop.className = 'kg-modal-backdrop';
    backdrop.addEventListener('click', closeModal);
    modal.appendChild(backdrop);

    var dialog = document.createElement('div');
    dialog.className = 'kg-modal-dialog';

    var closeBtn = document.createElement('button');
    closeBtn.className = 'kg-modal-close';
    closeBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    closeBtn.addEventListener('click', closeModal);
    dialog.appendChild(closeBtn);

    var body = document.createElement('div');
    body.className = 'kg-modal-body';

    var svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgEl.style.width = '100%';
    svgEl.style.height = '100%';
    svgEl.style.display = 'block';
    body.appendChild(svgEl);
    dialog.appendChild(body);

    modal.appendChild(dialog);
    document.body.appendChild(modal);

    // Trigger reflow for animation
    modal.offsetHeight;
    modal.classList.add('kg-modal-open');

    var modalSim = null;

    function renderModalGraph() {
      var w = body.clientWidth || 800;
      var h = body.clientHeight || 600;
      svgEl.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
      if (modalSim) modalSim.stop();
      modalSim = renderGraph(svgEl, w, h, true);
    }

    // Render graph after modal is visible
    requestAnimationFrame(renderModalGraph);

    // Auto-resize on window resize
    var resizeTimer = null;
    var ro = new ResizeObserver(function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(renderModalGraph, 150);
    });
    ro.observe(body);

    // Store for cleanup
    modal._ro = ro;
    modal._sim = function () { return modalSim; };

    // ESC to close
    document.addEventListener('keydown', function handler(e) {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', handler);
      }
    });
  }

  function closeModal() {
    var modal = document.getElementById('kg-modal');
    if (modal) {
      if (modal._ro) modal._ro.disconnect();
      if (modal._sim && modal._sim()) modal._sim().stop();
      modal.classList.remove('kg-modal-open');
      setTimeout(function () { modal.remove(); }, 300);
    }
  }

  var lastUrl = location.href;
  var lastDataStr = null;

  function tryInit() {
    if (typeof d3 === 'undefined') return;
    if (!window.__GRAPH_DATA__) return;
    var dataStr = JSON.stringify(window.__GRAPH_DATA__);
    var tocSidebar = document.querySelector('.md-sidebar--secondary .md-sidebar__scrollwrap');
    if (!tocSidebar) return;

    // Only re-render if data changed or graph container is missing
    var container = document.getElementById('knowledge-graph');
    if (dataStr === lastDataStr && container) return;

    startGraph();
    lastDataStr = dataStr;
  }

  // Initial load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(tryInit, 100); });
  } else {
    setTimeout(tryInit, 100);
  }

  // Poll for URL changes (mkdocs-material instant nav changes URL without reload)
  setInterval(function () {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      lastDataStr = null; // Force re-render
      setTimeout(tryInit, 200);
    }
  }, 200);

  // Also listen for popstate
  window.addEventListener('popstate', function () {
    lastDataStr = null;
    setTimeout(tryInit, 200);
  });

  // Watch for script tag changes (new __GRAPH_DATA__ injected)
  var bodyObserver = new MutationObserver(function (mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var added = mutations[i].addedNodes;
      for (var j = 0; j < added.length; j++) {
        if (added[j].nodeName === 'SCRIPT') {
          lastDataStr = null;
          setTimeout(tryInit, 100);
          return;
        }
      }
    }
  });
  bodyObserver.observe(document.body, { childList: true });
})();
