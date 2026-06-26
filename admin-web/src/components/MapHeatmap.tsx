'use client';

import { useEffect, useRef } from 'react';

interface MapHeatmapProps {
  className?: string;
  height?: number;
}

export default function MapHeatmap({ className = '', height = 400 }: MapHeatmapProps) {
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadLeaflet = async () => {
      const L = await import('leaflet');
      if (!mapRef.current) return;

      const map = L.map(mapRef.current, {
        center: [9.032, 38.742],
        zoom: 6,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      return () => {
        map.remove();
      };
    };

    loadLeaflet();
  }, []);

  return (
    <div
      ref={mapRef}
      className={`rounded-xl overflow-hidden border border-gray-200 shadow-sm ${className}`}
      style={{ height: `${height}px` }}
    />
  );
}
