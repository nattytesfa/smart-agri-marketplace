'use client';

import { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import Sidebar from '../../components/Sidebar';
import Footer from '../../components/Footer';
import { supabase } from '../../lib/supabaseClient';
import { getBackendClient } from '../../lib/apiClient';

const MapContainer = dynamic(
  () => import('react-leaflet').then((mod) => mod.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import('react-leaflet').then((mod) => mod.TileLayer),
  { ssr: false }
);
const GeoJSON = dynamic(
  () => import('react-leaflet').then((mod) => mod.GeoJSON),
  { ssr: false }
);

interface HeatmapData {
  geometry: string;
  listing_count: number;
  total_quantity: number;
  avg_price: number;
  crop_type: string;
}

export default function HeatmapPage() {
  const [data, setData] = useState<HeatmapData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCrop, setSelectedCrop] = useState('');
  const [mapReady, setMapReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const initLeaflet = async () => {
      const L = await import('leaflet');
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
      });
      setMapReady(true);
    };
    initLeaflet();
  }, []);

  const fetchHeatmapData = useCallback(async (crop?: string) => {
    setLoading(true);
    try {
      const api = await getBackendClient();
      const response = await api.get('/api/admin/heatmap', {
        params: { crop: crop || undefined },
      });
      setData(response.data);
    } catch (error) {
      console.error('Error fetching heatmap data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

   useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }
      await fetchHeatmapData();
    };
    checkAuth();
  }, [router, fetchHeatmapData]);

  const handleCropFilter = (crop: string) => {
    setSelectedCrop(crop);
    fetchHeatmapData(crop);
  };

  const getColor = (count: number) => {
    if (count > 20) return '#dc2626';
    if (count > 10) return '#f59e0b';
    if (count > 5) return '#10b981';
    return '#6b7280';
  };

  if (loading && !data.length) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <div className="w-14 h-14 rounded-full border-4 border-emerald-100 border-t-emerald-600 animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="material-symbols-outlined text-emerald-600 text-lg">trending_up</span>
            </div>
          </div>
          <p className="text-sm text-gray-500 font-medium">Loading heatmap data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50/80">
      <Sidebar />
      <div className="flex-1 p-8 pb-16">
        <div className="mb-8 animate-fade-in">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Analytics Heatmap</h1>
              <p className="text-sm text-gray-500 mt-0.5">Regional supply and demand visualization</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-xl border border-gray-200 shadow-sm text-xs">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                <span className="text-gray-600 font-medium">High</span>
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <span className="text-gray-600 font-medium">Medium</span>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="text-gray-600 font-medium">Low</span>
              </div>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-base pointer-events-none">filter_alt</span>
                <select
                  value={selectedCrop}
                  onChange={(e) => handleCropFilter(e.target.value)}
                  className="pl-9 pr-8 py-2 text-sm bg-white border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all duration-150 appearance-none cursor-pointer"
                >
                  <option value="">All Crops</option>
                  <option value="teff">Teff</option>
                  <option value="wheat">Wheat</option>
                  <option value="maize">Maize</option>
                  <option value="coffee">Coffee</option>
                </select>
                <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">expand_more</span>
              </div>
            </div>
          </div>
        </div>

        {data.length > 0 && mapReady ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 overflow-hidden animate-fade-in">
            <div className="h-[600px] relative">
              <MapContainer
                center={[9.032, 38.742]}
                zoom={6}
                style={{ height: '100%', width: '100%' }}
                zoomControl={true}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {data.map((item, index) => {
                  try {
                    const geometry = JSON.parse(item.geometry);
                    return (
                      <GeoJSON
                        key={index}
                        data={geometry}
                        style={{
                          color: getColor(item.listing_count),
                          weight: 2,
                          fillOpacity: 0.5,
                        }}
                      />
                    );
                  } catch (e) {
                    return null;
                  }
                })}
              </MapContainer>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 p-16 text-center animate-fade-in">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-3xl text-gray-300">map</span>
            </div>
            <p className="text-gray-500 font-medium">No data available for the heatmap</p>
            <p className="text-sm text-gray-400 mt-1">Create some listings to see regional data visualized</p>
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}
