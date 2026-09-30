import { useMemo } from 'react';
import type { NetworkRecord } from '../types';

/**
 * Force-free radial topology of the network conversations in a case.
 * Internal/source hosts anchor toward the centre; external destinations fan out
 * on a ring. Edge thickness reflects traffic volume; flagged edges glow red and
 * animate a packet dot. Pure SVG so it renders crisply inside Electron.
 */

interface GraphNode {
  id: string;
  x: number;
  y: number;
  kind: 'source' | 'dest';
  flagged: boolean;
  degree: number;
}

interface GraphEdge {
  from: string;
  to: string;
  bytes: number;
  flagged: boolean;
}

const W = 720;
const H = 460;
const CX = W / 2;
const CY = H / 2;

function isPrivate(ip: string): boolean {
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.|169\.254\.)/.test(ip);
}

export function NetworkGraph({ records }: { records: NetworkRecord[] }) {
  const { nodes, edges } = useMemo(() => {
    const nodeMap = new Map<string, GraphNode>();
    const edgeMap = new Map<string, GraphEdge>();

    const ensure = (id: string, kind: 'source' | 'dest'): GraphNode => {
      let n = nodeMap.get(id);
      if (!n) {
        n = { id, x: 0, y: 0, kind, flagged: false, degree: 0 };
        nodeMap.set(id, n);
      }
      return n;
    };

    for (const r of records) {
      const src = r.source_ip || 'unknown-src';
      const dst = r.destination_ip || 'unknown-dst';
      const sKind = isPrivate(src) ? 'source' : 'dest';
      const dKind = isPrivate(dst) ? 'source' : 'dest';
      const s = ensure(src, sKind);
      const d = ensure(dst, dKind);
      s.degree += 1;
      d.degree += 1;
      const key = `${src}→${dst}`;
      const existing = edgeMap.get(key);
      if (existing) {
        existing.bytes += r.bytes || 0;
        existing.flagged = existing.flagged || Boolean(r.anomaly_flag);
      } else {
        edgeMap.set(key, { from: src, to: dst, bytes: r.bytes || 0, flagged: Boolean(r.anomaly_flag) });
      }
      if (r.anomaly_flag) {
        s.flagged = true;
        d.flagged = true;
      }
    }

    const sources = [...nodeMap.values()].filter((n) => n.kind === 'source');
    const dests = [...nodeMap.values()].filter((n) => n.kind === 'dest');

    // sources cluster near centre column, dests fan on an outer ring
    sources.forEach((n, i) => {
      const gap = H / (sources.length + 1);
      n.x = CX + (sources.length > 1 ? (i % 2 === 0 ? -70 : 70) : 0);
      n.y = gap * (i + 1);
    });
    dests.forEach((n, i) => {
      const angle = (Math.PI * 2 * i) / Math.max(dests.length, 1) - Math.PI / 2;
      const radius = Math.min(W, H) / 2 - 46;
      n.x = CX + Math.cos(angle) * radius;
      n.y = CY + Math.sin(angle) * radius * 0.92;
    });

    return { nodes: [...nodeMap.values()], edges: [...edgeMap.values()] };
  }, [records]);

  const nodeById = useMemo(() => {
    const m = new Map<string, GraphNode>();
    for (const n of nodes) m.set(n.id, n);
    return m;
  }, [nodes]);

  const maxBytes = useMemo(() => Math.max(1, ...edges.map((e) => e.bytes)), [edges]);

  if (nodes.length === 0) return null;

  return (
    <div className="netgraph-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="netgraph" role="img" aria-label="Network topology graph">
        <defs>
          <radialGradient id="ng-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(94,234,212,0.35)" />
            <stop offset="100%" stopColor="rgba(94,234,212,0)" />
          </radialGradient>
        </defs>
        <circle cx={CX} cy={CY} r={Math.min(W, H) / 2 - 40} fill="none" stroke="rgba(96,165,250,0.1)" strokeDasharray="4 6" />
        <circle cx={CX} cy={CY} r={Math.min(W, H) / 3.4} fill="url(#ng-core)" />

        {edges.map((e, i) => {
          const a = nodeById.get(e.from);
          const b = nodeById.get(e.to);
          if (!a || !b) return null;
          const weight = 0.6 + (e.bytes / maxBytes) * 3.2;
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2 - 24;
          const path = `M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`;
          return (
            <g key={`${e.from}-${e.to}-${i}`}>
              <path
                d={path}
                fill="none"
                stroke={e.flagged ? 'rgba(251,113,133,0.6)' : 'rgba(94,234,212,0.22)'}
                strokeWidth={weight}
                strokeLinecap="round"
              />
              {e.flagged ? (
                <circle r="3.2" fill="#fecdd3">
                  <animateMotion dur="2.4s" repeatCount="indefinite" path={path} />
                </circle>
              ) : null}
            </g>
          );
        })}

        {nodes.map((n) => {
          const size = Math.min(15, 5 + n.degree * 0.8);
          const color = n.flagged ? '#fb7185' : n.kind === 'source' ? '#5eead4' : '#60a5fa';
          const label = n.id.length > 21 ? `${n.id.slice(0, 20)}…` : n.id;
          return (
            <g key={n.id} className="netgraph-node">
              <circle cx={n.x} cy={n.y} r={size + 4} fill={color} opacity={0.16} />
              <circle cx={n.x} cy={n.y} r={size} fill={color} opacity={0.9}>
                {n.flagged ? (
                  <animate attributeName="opacity" values="0.9;0.4;0.9" dur="1.6s" repeatCount="indefinite" />
                ) : null}
              </circle>
              <text
                x={n.x}
                y={n.y + size + 12}
                textAnchor="middle"
                className="netgraph-label"
                fill={n.flagged ? '#fecdd3' : 'rgba(202,213,231,0.85)'}
              >
                {label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="netgraph-legend">
        <span><i className="ng-dot ng-src" /> Internal host</span>
        <span><i className="ng-dot ng-dst" /> External endpoint</span>
        <span><i className="ng-dot ng-flag" /> Flagged / anomalous</span>
      </div>
    </div>
  );
}
