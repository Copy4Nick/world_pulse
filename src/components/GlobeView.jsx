import { useEffect, useRef } from 'react';
import Globe from 'globe.gl';
import * as THREE from 'three';
import { feature } from 'topojson-client';
import worldTopology from 'world-atlas/countries-110m.json';
import countryNames from '../data/countryNames.js';

// Pre-process country data once at module level
const countryFeatures = feature(worldTopology, worldTopology.objects.countries).features;

function computeCentroid(geom) {
  let ring;
  if (geom.type === 'Polygon') {
    ring = geom.coordinates[0];
  } else {
    ring = geom.coordinates
      .map(poly => poly[0])
      .reduce((a, b) => (b.length > a.length ? b : a));
  }
  const lats = ring.map(c => c[1]);
  const lngs = ring.map(c => c[0]);
  return {
    lat: (Math.min(...lats) + Math.max(...lats)) / 2,
    lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
  };
}

const countryLabels = countryFeatures
  .filter(f => countryNames[Number(f.id)])
  .map(f => {
    const { lat, lng } = computeCentroid(f.geometry);
    return { lat, lng, text: countryNames[Number(f.id)] };
  });

// Draw country borders onto a canvas → CanvasTexture (no z-fighting, arbitrary lineWidth)
function createBordersTexture(features) {
  const W = 4096, H = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.strokeStyle = 'rgba(160, 200, 255, 0.72)';
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';

  const project = (lng, lat) => [
    (lng + 180) / 360 * W,
    (90 - lat) / 180 * H,
  ];

  features.forEach(f => {
    const geom = f.geometry;
    const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
    polys.forEach(poly => {
      poly.forEach(ring => {
        ctx.beginPath();
        ring.forEach(([lng, lat], i) => {
          const [x, y] = project(lng, lat);
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            // skip segment if it crosses the antimeridian (±180°) — prevents canvas-spanning lines
            const prevLng = ring[i - 1][0];
            if (Math.abs(lng - prevLng) > 180) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          }
        });
        ctx.stroke();
      });
    });
  });

  return new THREE.CanvasTexture(canvas);
}

// Day/night + borders — all in one shader, same UV = perfect alignment
const vertexShader = /* glsl */`
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  void main() {
    vUv = uv;
    vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */`
  uniform sampler2D dayTexture;
  uniform sampler2D nightTexture;
  uniform sampler2D bordersTexture;
  uniform vec3 sunDirection;
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  void main() {
    vec4 dayColor     = texture2D(dayTexture,     vUv);
    vec4 nightColor   = texture2D(nightTexture,   vUv);
    vec4 bordersColor = texture2D(bordersTexture, vUv);
    float cosAngle    = dot(normalize(vWorldNormal), normalize(sunDirection));
    float blend       = smoothstep(-0.12, 0.18, cosAngle);
    vec4 earth        = mix(nightColor, dayColor, blend);
    // overlay borders using alpha
    gl_FragColor      = vec4(mix(earth.rgb, bordersColor.rgb, bordersColor.a), 1.0);
  }
`;

function getSunDirection() {
  const now = new Date();
  const utcH = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
  const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 0));
  const dayOfYear = Math.floor((now - start) / 86_400_000);
  const sunLng = (12 - utcH) * 15;
  const sunLat = 23.45 * Math.sin((2 * Math.PI * (dayOfYear - 80)) / 365);
  const lat = (sunLat * Math.PI) / 180;
  const lng = (sunLng * Math.PI) / 180;
  return new THREE.Vector3(
    -Math.cos(lat) * Math.sin(lng),
    Math.sin(lat),
    Math.cos(lat) * Math.cos(lng),
  );
}


export default function GlobeView({ situations, filter, onSelect, selected }) {
  const mountRef = useRef(null);
  const globeRef = useRef(null);

  const visible = filter === 'all'
    ? situations
    : situations.filter(s => s.type === filter);

  useEffect(() => {
    const el = mountRef.current;
    if (!el || globeRef.current) return;

    const g = Globe()(el);
    globeRef.current = g;

    // --- Day/Night globe material ---
    const loader = new THREE.TextureLoader();
    const sunUniform = { value: getSunDirection() };
    const bordersTexture = createBordersTexture(countryFeatures);

    const globeMat = new THREE.ShaderMaterial({
      uniforms: {
        dayTexture:     { value: loader.load('/textures/earth-day-bluemarble-4k.jpg') },
        nightTexture:   { value: loader.load('/textures/earth-night-4k.jpg') },
        bordersTexture: { value: bordersTexture },
        sunDirection:   sunUniform,
      },
      vertexShader,
      fragmentShader,
    });

    g
      .width(el.offsetWidth)
      .height(el.offsetHeight)
      .backgroundColor('rgba(0,0,0,0)')
      .globeMaterial(globeMat)
      .atmosphereColor('#1a4a8a')
      .atmosphereAltitude(0.18)
      // No polygonsData — borders are handled by canvas texture sphere below
      .polygonsData([])
      // Country name labels
      .labelsData(countryLabels)
      .labelLat('lat')
      .labelLng('lng')
      .labelText('text')
      .labelSize(0.75)
      .labelColor(() => 'rgba(220,235,255,0.9)')
      .labelDotRadius(0)
      .labelAltitude(0.006)
      .labelResolution(2)
      // Rings
      .ringsData([])
      .ringColor(() => '#ffffff')
      .ringMaxRadius(4)
      .ringPropagationSpeed(2)
      .ringRepeatPeriod(1000)
      // Points
      .pointsData([])
      .pointColor('color')
      .pointAltitude(0.01)
      .pointRadius('radius')
      .pointsMerge(false)
      .onPointClick(p => onSelect(p.sit));

    g.controls().autoRotate = true;
    g.controls().autoRotateSpeed = 0.4;
    g.controls().enableDamping = true;
    g.controls().dampingFactor = 0.08;
    g.pointOfView({ lat: 20, lng: 15, altitude: 2.2 }, 0);

    // Update sun direction every minute
    const sunTimer = setInterval(() => {
      sunUniform.value = getSunDirection();
    }, 60_000);

    const ro = new ResizeObserver(() => {
      g.width(el.offsetWidth).height(el.offsetHeight);
    });
    ro.observe(el);

    return () => {
      clearInterval(sunTimer);
      ro.disconnect();
      bordersTexture.dispose();
      globeRef.current = null;
      el.innerHTML = '';
    };
  }, []);

  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;

    const points = visible.map(s => ({
      lat: s.lat, lng: s.lng, color: s.color,
      radius: 0.4 + s.scale * 0.5, sit: s,
    }));
    const rings = visible.map(s => ({
      lat: s.lat, lng: s.lng, color: s.color,
      maxR: 2.5 + s.scale * 2,
      propagationSpeed: 1.5,
      repeatPeriod: 1200 + (1 - s.scale) * 800,
    }));

    g.pointsData(points).pointColor('color').pointRadius('radius');
    g.ringsData(rings)
     .ringColor(d => d.color)
     .ringMaxRadius(d => d.maxR)
     .ringPropagationSpeed(d => d.propagationSpeed)
     .ringRepeatPeriod(d => d.repeatPeriod);
  }, [visible]);

  useEffect(() => {
    const g = globeRef.current;
    if (!g || !selected) return;
    g.controls().autoRotate = false;
    g.pointOfView({ lat: selected.lat, lng: selected.lng, altitude: 1.6 }, 800);
  }, [selected]);

  useEffect(() => {
    const g = globeRef.current;
    if (!g || selected) return;
    setTimeout(() => {
      if (globeRef.current) globeRef.current.controls().autoRotate = true;
    }, 400);
  }, [selected]);

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />;
}
