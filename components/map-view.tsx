"use client";

import { GoogleMap, useLoadScript } from "@react-google-maps/api";
import { useState, useRef, useEffect, useCallback } from "react";

// --- [타입 선언] ---
declare global {
  namespace JSX {
    interface IntrinsicElements {
      "gmp-place-autocomplete": any;
    }
  }
}

// --- [UI 텍스트 사전] ---
const UI_TEXT = {
  ko: {
    searchPlaceholder: "장소를 검색해보세요",
    open: "영업 중",
    closed: "영업 종료",
    copy: "복사",
    copyAlert: "전화번호가 복사되었습니다:",
    visitWeb: "웹사이트 방문",
    delete: "삭제하기",
    save: "저장하기",
    ratingCount: "명",
    addressError: "주소 정보 없음",
    defaultName: "장소 정보"
  },
  en: {
    searchPlaceholder: "Search places...",
    open: "Open Now",
    closed: "Closed",
    copy: "Copy",
    copyAlert: "Phone number copied:",
    visitWeb: "Visit Website",
    delete: "Remove",
    save: "Save",
    ratingCount: " reviews",
    addressError: "No address info",
    defaultName: "Place Info"
  }
};

const LIBRARIES = ["places", "marker"] as const;
const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!;

// --- [1. 최신 방식 장소 변환 함수] ---
async function transformPlace(place: any) {
  if (!place) return null;

  const { Place } = (await google.maps.importLibrary("places")) as google.maps.PlacesLibrary;

  let modernPlace = place;
  const pid = modernPlace.id || modernPlace.place_id || modernPlace.placePrediction?.placeId;

  if (pid && !(modernPlace instanceof Place)) {
    modernPlace = new Place({ id: pid });
  }

  // ✅ isOpen() 사용을 위해 utcOffsetMinutes 필수 포함
  await modernPlace.fetchFields({
    fields: [
      "displayName",
      "formattedAddress",
      "location",
      "rating",
      "userRatingCount",
      "regularOpeningHours",
      "photos",
      "internationalPhoneNumber",
      "websiteURI",
      "id",
      "types",
      "utcOffsetMinutes", 
    ],
  });

  console.log("🔥 [API 원본 데이터] Google Maps Place Object:", modernPlace);

  let openStatus = false;
  try {
    // ✅ Beta 채널에서만 작동하는 isOpen() 함수 호출
    openStatus = await modernPlace.isOpen(new Date());
  } catch (e) {
    console.warn("영업 상태 확인 실패 (API 버전 확인 필요):", e);
    // isOpen 실패 시 기본값 false (혹은 여기서 수동 계산 로직을 넣을 수도 있음)
    openStatus = false; 
  }

  const firstPhoto = modernPlace.photos?.[0];
  const photoString = firstPhoto?.getURI
    ? firstPhoto.getURI({ maxWidth: 400, maxHeight: 400 })
    : null;

  const weekdayText = modernPlace.regularOpeningHours?.weekdayDescriptions || [];

  const result = {
    place_id: modernPlace.id,
    name: modernPlace.displayName, 
    formatted_address: modernPlace.formattedAddress,
    geometry: { location: modernPlace.location },
    rating: modernPlace.rating,
    user_ratings_total: modernPlace.userRatingCount,
    opening_hours: {
      isOpen: openStatus,
      weekdayText: weekdayText,
    },
    photoUrl: photoString,
    formatted_phone_number: modernPlace.internationalPhoneNumber,
    types: modernPlace.types,
    websiteURI: modernPlace.websiteURI,
  };

  console.log("✨ [가공된 데이터] UI에 표시할 객체:", result);

  return result;
}

// --- [2. 최신 마커 컴포넌트] ---
function AdvancedMarker({
  map,
  position,
  onClick,
}: {
  map: google.maps.Map | null;
  position: google.maps.LatLngLiteral;
  onClick?: () => void;
}) {
  const markerRef = useRef<any>(null);

  useEffect(() => {
    if (!map) return;
    const init = async () => {
      const { AdvancedMarkerElement } = (await google.maps.importLibrary("marker")) as google.maps.MarkerLibrary;
      
      if (!markerRef.current) {
        markerRef.current = new AdvancedMarkerElement({ map, position });
        
        // ✅ gmp-click 이벤트 리스너 (경고 해결)
        if (onClick) {
          markerRef.current.addEventListener("gmp-click", onClick);
        }
      } else {
        markerRef.current.position = position;
      }
    };
    init();

    return () => {
      if (markerRef.current) {
        if (onClick) {
            markerRef.current.removeEventListener("gmp-click", onClick);
        }
        markerRef.current.map = null;
        markerRef.current = null;
      }
    };
  }, [map, position, onClick]);

  return null;
}

const containerStyle = { width: "100%", height: "100vh" };

type SavedMarker = {
  id: string;
  lat: number;
  lng: number;
  name: string;
  address?: string;
  types?: string[];
};

// --- [3. 메인 컴포넌트] ---
export default function Home() {
  const [langCode, setLangCode] = useState<'ko' | 'en'>('en');
  const t = UI_TEXT[langCode];

  useEffect(() => {
    if (typeof window !== 'undefined' && navigator.language) {
      setLangCode(navigator.language.includes('ko') ? 'ko' : 'en');
    }
  }, []);

  // ✅ [수정] 속성명을 'v' -> 'version'으로 변경해야 Beta 버전이 로드됩니다.
  const { isLoaded } = useLoadScript({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: LIBRARIES as any,
    version: "beta", // ✨ 여기가 핵심입니다!
  });

  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [center, setCenter] = useState({ lat: 37.5665, lng: 126.978 });
  const [selectedPlace, setSelectedPlace] = useState<any>(null); 
  const [showDetails, setShowDetails] = useState(false);         
  const [savedMarkers, setSavedMarkers] = useState<SavedMarker[]>([]);
  const mapRef = useRef<google.maps.Map | null>(null);

  const getCategoryIcon = (types?: string[]) => {
    if (!types || types.length === 0) return "📍";
    if (types.includes("restaurant") || types.includes("food")) return "🍽️";
    if (types.includes("cafe") || types.includes("bakery")) return "☕";
    if (types.includes("bar") || types.includes("night_club")) return "🍺";
    if (types.includes("lodging") || types.includes("hotel")) return "🏨";
    if (types.includes("store") || types.includes("shopping_mall")) return "🛍️";
    return "📍";
  };

  const getTodayHours = (weekdayText: string[]) => {
    if (!weekdayText || weekdayText.length === 0) return "";
    const todayIndex = new Date().getDay(); 
    const googleIndex = todayIndex === 0 ? 6 : todayIndex - 1;
    const rawText = weekdayText[googleIndex];
    if (!rawText) return "";
    return rawText.split(": ").slice(1).join(": ") || rawText;
  };

  const handleCopyPhone = (phone: string) => {
    navigator.clipboard.writeText(phone);
    alert(`${t.copyAlert} ${phone}`);
  };

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      });
    }
    const saved = localStorage.getItem("my_saved_places");
    if (saved) setSavedMarkers(JSON.parse(saved));
  }, []);

  // 🔎 검색창
  useEffect(() => {
    if (!isLoaded) return;
    const initAutocomplete = async () => {
      const placesLib = (await google.maps.importLibrary("places")) as any;
      const PlaceAutocompleteElement = placesLib.PlaceAutocompleteElement;
      
      if (document.querySelector("gmp-place-autocomplete")) return;
      
      const autocomplete = new PlaceAutocompleteElement();
      autocomplete.placeholder = t.searchPlaceholder; 
      const container = document.getElementById("autocomplete-container");
      
      if (container) {
        container.innerHTML = "";
        container.appendChild(autocomplete);
        
        autocomplete.addEventListener("gmp-select", async (e: any) => {
          const prediction = e.placePrediction;
          if (!prediction) return;
          
          console.log("🔎 [검색 선택] 검색된 장소:", prediction.placeId);

          const place = prediction.toPlace();
          const formatted = await transformPlace(place);

          if (formatted && formatted.geometry?.location) {
            const loc = formatted.geometry.location;
            const lat = typeof loc.lat === 'function' ? loc.lat() : loc.lat;
            const lng = typeof loc.lng === 'function' ? loc.lng() : loc.lng;

            setCenter({ lat, lng });
            mapRef.current?.panTo({ lat, lng });
            mapRef.current?.setZoom(16);

            setSelectedPlace(formatted);
            setShowDetails(false); 
          }
        });
      }
    };
    initAutocomplete();
  }, [isLoaded, t]);

  // 🗺 지도 클릭
  const handleMapClick = useCallback(async (e: google.maps.MapMouseEvent) => {
    if (!mapRef.current) return;
    if ((e as any).placeId) {
      e.stop();
      
      console.log("👆 [지도 클릭] POI 클릭됨 ID:", (e as any).placeId);

      const { Place } = (await google.maps.importLibrary("places")) as google.maps.PlacesLibrary;
      const place = new Place({ id: (e as any).placeId });
      const formatted = await transformPlace(place);
      setSelectedPlace(formatted);
      setShowDetails(true);
    } else {
      setSelectedPlace(null);
      setShowDetails(false);
    }
  }, []);

  const handleSavePlace = () => {
    if (!selectedPlace?.geometry?.location) return;
    const loc = selectedPlace.geometry.location;
    const newMarker: SavedMarker = {
      id: selectedPlace.place_id,
      lat: typeof loc.lat === 'function' ? loc.lat() : loc.lat,
      lng: typeof loc.lng === 'function' ? loc.lng() : loc.lng,
      name: selectedPlace.name,
      address: selectedPlace.formatted_address,
      types: selectedPlace.types,
    };
    const updated = [...savedMarkers, newMarker];
    setSavedMarkers(updated);
    localStorage.setItem("my_saved_places", JSON.stringify(updated));
  };

  const handleDeletePlace = () => {
    const updated = savedMarkers.filter((m) => m.id !== selectedPlace.place_id);
    setSavedMarkers(updated);
    localStorage.setItem("my_saved_places", JSON.stringify(updated));
    setSelectedPlace(null);
    setShowDetails(false);
  };

  if (!isLoaded) return <div style={{ padding: 20 }}>Loading...</div>;

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 20, left: "50%", transform: "translateX(-50%)", zIndex: 10, width: "90%", maxWidth: 400 }}>
        <div id="autocomplete-container" />
      </div>

      <GoogleMap
        mapContainerStyle={containerStyle}
        center={center}
        zoom={14}
        onLoad={(m) => {
          mapRef.current = m;
          setMap(m);
        }}
        onClick={handleMapClick}
        options={{
          mapId: "AIzaSyCIvFUn_6kp7fbK0umBs_lA9hG0TWhKYuk",
          clickableIcons: true,
          disableDefaultUI: false,
          zoomControl: true,
        }}
      >
        {selectedPlace?.geometry?.location && (
          <AdvancedMarker
            map={map}
            position={{
              lat: typeof selectedPlace.geometry.location.lat === 'function' ? selectedPlace.geometry.location.lat() : selectedPlace.geometry.location.lat,
              lng: typeof selectedPlace.geometry.location.lng === 'function' ? selectedPlace.geometry.location.lng() : selectedPlace.geometry.location.lng,
            }}
            onClick={() => setShowDetails(true)}
          />
        )}
        {savedMarkers.map((marker) => (
          <AdvancedMarker
            key={marker.id}
            map={map}
            position={{ lat: marker.lat, lng: marker.lng }}
            onClick={() => setCenter({ lat: marker.lat, lng: marker.lng })}
          />
        ))}
      </GoogleMap>

      {selectedPlace && showDetails && (
        <div style={{ position: "absolute", bottom: "30px", left: "50%", transform: "translateX(-50%)", width: "90%", maxWidth: "400px", padding: "24px 20px", borderRadius: "16px", background: "white", boxShadow: "0 4px 20px rgba(0,0,0,0.15)", zIndex: 20, animation: "fadeIn 0.3s ease-out", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}>
          <button onClick={() => setShowDetails(false)} style={{ position: "absolute", top: 15, right: 15, border: "none", background: "transparent", fontSize: "20px", color: "#999", cursor: "pointer" }}>✕</button>

          {selectedPlace.photoUrl && (
            <img src={selectedPlace.photoUrl} alt="place" style={{ width: "100%", height: "160px", objectFit: "cover", borderRadius: "12px", marginBottom: "16px" }} />
          )}

          <h3 style={{ margin: "0 0 4px 0", fontSize: "19px", color: "#242424", fontWeight: 700, lineHeight: 1.4 }}>
            {getCategoryIcon(selectedPlace.types)} {selectedPlace.name || t.defaultName}
          </h3>
          
          {selectedPlace.rating && (
            <div style={{ fontSize: "14px", color: "#555", marginBottom: "12px" }}>
              <span style={{ color: "#f5a623" }}>★</span> 
              <span style={{ fontWeight: 600 }}>{selectedPlace.rating}</span>
              <span style={{ color: "#999" }}> ({selectedPlace.user_ratings_total}{t.ratingCount})</span>
            </div>
          )}

          <hr style={{ border: "none", borderTop: "1px solid #eee", margin: "12px 0" }} />

          <div style={{ display: "flex", alignItems: "flex-start", marginBottom: "12px", fontSize: "14px", lineHeight: 1.5 }}>
            <span style={{ marginRight: "10px", color: "#70757a", marginTop: "2px" }}>📍</span>
            <span style={{ color: "#3c4043" }}>{selectedPlace.formatted_address || t.addressError}</span>
          </div>

          <div style={{ display: "flex", alignItems: "flex-start", marginBottom: "12px", fontSize: "14px", lineHeight: 1.5 }}>
            <span style={{ marginRight: "10px", color: "#70757a", marginTop: "2px" }}>🕒</span>
            <div>
              <span style={{ fontWeight: "bold", color: selectedPlace.opening_hours.isOpen ? "#188038" : "#d93025", marginRight: "6px" }}>
                {selectedPlace.opening_hours.isOpen ? t.open : t.closed}
              </span>
              <span style={{ color: "#70757a" }}>
                 · {getTodayHours(selectedPlace.opening_hours.weekdayText)}
              </span>
            </div>
          </div>

          {selectedPlace.formatted_phone_number && (
            <div style={{ display: "flex", alignItems: "center", marginBottom: "12px", fontSize: "14px", lineHeight: 1.5 }}>
              <span style={{ marginRight: "10px", color: "#70757a" }}>📞</span>
              <span style={{ color: "#3c4043", marginRight: "8px" }}>{selectedPlace.formatted_phone_number}</span>
              <button onClick={() => handleCopyPhone(selectedPlace.formatted_phone_number)} style={{ border: "1px solid #dadce0", background: "white", color: "#1a73e8", borderRadius: "100px", fontSize: "12px", padding: "2px 10px", cursor: "pointer", fontWeight: 500 }}>
                {t.copy}
              </button>
            </div>
          )}

           {selectedPlace.websiteURI && (
             <div style={{ display: "flex", alignItems: "center", marginBottom: "12px", fontSize: "14px" }}>
               <span style={{ marginRight: "10px", color: "#70757a" }}>🌐</span>
               <a href={selectedPlace.websiteURI} target="_blank" rel="noreferrer" style={{ color: "#1a73e8", textDecoration: "none" }}>
                 {t.visitWeb}
               </a>
             </div>
           )}

          <div style={{ marginTop: "20px" }}>
            {savedMarkers.some((m) => m.id === selectedPlace.place_id) ? (
              <button onClick={handleDeletePlace} style={{ width: "100%", padding: "12px", backgroundColor: "#f2f2f2", color: "#d93025", border: "none", borderRadius: "8px", fontWeight: "bold", fontSize: "14px", cursor: "pointer" }}>
                {t.delete}
              </button>
            ) : (
              <button onClick={handleSavePlace} style={{ width: "100%", padding: "12px", backgroundColor: "#1a73e8", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", fontSize: "14px", cursor: "pointer", boxShadow: "0 1px 2px rgba(60,64,67,0.3), 0 1px 3px 1px rgba(60,64,67,0.15)" }}>
                {t.save}
              </button>
            )}
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translate(-50%, 20px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
    </div>
  );
}