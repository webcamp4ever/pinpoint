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
    copy: "복사",
    copyAlert: "전화번호가 복사되었습니다:",
    visitWeb: "웹사이트 방문",
    delete: "삭제",
    save: "저장",
    update: "수정",
    cancel: "취소",
    ratingCount: "명",
    addressError: "주소 정보 없음",
    defaultName: "장소 정보",
    memoPlaceholder: "이 장소에 대한 메모를 남겨보세요...",
    apiError: "서버 통신 중 오류가 발생했습니다."
  },
  en: {
    searchPlaceholder: "Search places...",
    copy: "Copy",
    copyAlert: "Phone number copied:",
    visitWeb: "Visit Website",
    delete: "Remove",
    save: "Save",
    update: "Update",
    cancel: "Cancel",
    ratingCount: " reviews",
    addressError: "No address info",
    defaultName: "Place Info",
    memoPlaceholder: "Write a memo for this place...",
    apiError: "An error occurred while communicating with the server."
  }
};

const GOOGLE_MAPS_LIBRARIES: ("places" | "marker")[] = ["places", "marker"];
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

  let openStatus = false;
  try {
    openStatus = await modernPlace.isOpen(new Date());
  } catch (e) {
    console.warn("영업 상태 확인 실패:", e);
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

const containerStyle = { width: "100%", height: "100%" };

type SavedMarker = {
  id: string;
   place_id?: string; // 👈 DB에서 넘어오는 구글 장소 ID 추가
  lat: number;
  lng: number;
  name: string;
  address?: string;
  types?: string[];
  memo?: string; 
};

// --- [3. 메인 컴포넌트] ---
export default function Home() {
  const [langCode, setLangCode] = useState<'ko' | 'en'>('en');
  const t = UI_TEXT[langCode];

  const [isLoadingApi, setIsLoadingApi] = useState(false); // API 통신 중 로딩 상태

  useEffect(() => {
    if (typeof window !== 'undefined' && navigator.language) {
      setLangCode(navigator.language.includes('ko') ? 'ko' : 'en');
    }
  }, []);

  const { isLoaded } = useLoadScript({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: GOOGLE_MAPS_LIBRARIES,
    version: "beta", 
  });

  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [center, setCenter] = useState({ lat: 37.5665, lng: 126.978 });
  const [selectedPlace, setSelectedPlace] = useState<any>(null); 
  const [showDetails, setShowDetails] = useState(false);         
  const [savedMarkers, setSavedMarkers] = useState<SavedMarker[]>([]);
  const [memo, setMemo] = useState(""); 
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
    if (selectedPlace) {
      // 👈 m.place_id 와 m.id 모두 체크하도록 변경
      const saved = savedMarkers.find((m) => (m.place_id || m.id) === selectedPlace.place_id);
      setMemo(saved?.memo || "");
    }
  }, [selectedPlace, savedMarkers]);

  // 💡 [변경] 최초 진입 시 서버(DB)에서 핀 데이터 불러오기
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      });
    }

    const fetchSavedPins = async () => {
      try {
        const response = await fetch("/api/pins");
        if (response.ok) {
          const data = await response.json();
          setSavedMarkers(data);
        }
      } catch (error) {
        console.error("Failed to load pins from server:", error);
      }
    };
    
    fetchSavedPins();
  }, []);

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
            setShowDetails(true); 
          }
        });
      }
    };
    initAutocomplete();
  }, [isLoaded, t]);

  const handleMapClick = useCallback(async (e: google.maps.MapMouseEvent) => {
    if (!mapRef.current) return;
    if ((e as any).placeId) {
      e.stop();
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

  // 💡 서버(DB)에 핀 데이터 저장/수정 요청
  // 💡 서버(DB)에 핀 데이터 저장/수정 요청
  const handleSavePlace = async () => {
    if (!selectedPlace?.geometry?.location) return;
    setIsLoadingApi(true);

    const loc = selectedPlace.geometry.location;
    
    // 1. 기존에 저장된 핀인지 확인하여 기존 DB의 고유 UUID 확보
    const existingMarker = savedMarkers.find((m) => (m.place_id || m.id) === selectedPlace.place_id);

    // 2. 서버로 전송할 데이터 구성
    const payload: any = {
      place_id: selectedPlace.place_id,
      lat: typeof loc.lat === 'function' ? loc.lat() : loc.lat,
      lng: typeof loc.lng === 'function' ? loc.lng() : loc.lng,
      name: selectedPlace.name,
      address: selectedPlace.formatted_address,
      types: selectedPlace.types,
      memo: memo,
    };

    // ✨ 기존 핀일 경우, DB 고유 ID(UUID)를 추가해서 중복 생성을 막음
    if (existingMarker && existingMarker.id) {
      payload.id = existingMarker.id;
    }

    try {
      // 🚀 핵심 수정 부분: method를 무조건 "POST"로 고정합니다!
            const response = await fetch("/api/pins", {
     // payload에 고유 id가 있으면 수정(PUT), 없으면 신규 저장(POST)
  method: payload.id ? "PUT" : "POST", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error("Save/Update failed");

      // 응답 데이터를 바탕으로 프론트엔드 데이터 구성
      let savedData = payload;
      try {
        const resData = await response.json();
        if (resData && resData.id) savedData = resData; 
      } catch (e) {
        // 응답이 json이 아닐 경우 무시
      }

      // 3. 화면 UI 상태 업데이트
      if (existingMarker) {
        // 기존 핀 수정 시 덮어쓰기
        const updated = savedMarkers.map((m) =>
          (m.place_id || m.id) === selectedPlace.place_id ? { ...m, ...savedData } : m
        );
        setSavedMarkers(updated);
      } else {
        // 신규 핀 저장 시 목록에 추가
        setSavedMarkers([...savedMarkers, savedData as SavedMarker]);
      }
      
      setShowDetails(false);
    } catch (error) {
      alert("API 요청 중 오류가 발생했습니다.");
      console.error(error);
    } finally {
      setIsLoadingApi(false);
    }
  };

  // 💡 [변경] 서버(DB)에 핀 데이터 삭제 요청
  const handleDeletePlace = async () => {
    if (!selectedPlace) return;
    setIsLoadingApi(true);

    try {
      const response = await fetch(`/api/pins?id=${selectedPlace.place_id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Delete failed");

      const updated = savedMarkers.filter((m) => (m.place_id || m.id) !== selectedPlace.place_id);
      setSavedMarkers(updated);
      setSelectedPlace(null);
      setShowDetails(false);
    } catch (error) {
      alert(t.apiError);
      console.error(error);
    } finally {
      setIsLoadingApi(false);
    }
  };

  if (!isLoaded) return <div style={{ padding: 20 }}>Loading...</div>;

  const isSaved = savedMarkers.some((m) => (m.place_id || m.id) === selectedPlace?.place_id);

  return (
    <div style={{ position: "relative", width: "100%", height: "calc(100vh - 100px)", minHeight: "600px", overflow: "hidden", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}>
      
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
            onClick={async () => {
              // 1. 클릭한 위치로 지도 이동
              setCenter({ lat: marker.lat, lng: marker.lng });
              
              // 2. 저장된 장소의 구글 데이터 불러와서 팝업 띄우기
              const targetId = marker.place_id || marker.id;
              if (targetId) {
                const { Place } = (await google.maps.importLibrary("places")) as google.maps.PlacesLibrary;
                const place = new Place({ id: targetId });
                const formatted = await transformPlace(place);
                setSelectedPlace(formatted);
                setShowDetails(true);
              }
            }}
          />
        ))}
      </GoogleMap>

      {selectedPlace && showDetails && (
        <div style={{ position: "absolute", bottom: "30px", left: "50%", transform: "translateX(-50%)", width: "90%", maxWidth: "400px", padding: "24px 20px", borderRadius: "16px", background: "white", boxShadow: "0 4px 20px rgba(0,0,0,0.15)", zIndex: 20, animation: "fadeIn 0.3s ease-out" }}>
          
          <button onClick={() => setShowDetails(false)} style={{ position: "absolute", top: 15, right: 15, border: "none", background: "transparent", fontSize: "20px", color: "#999", cursor: "pointer" }}>✕</button>

          <div style={{ display: "flex", gap: "16px", alignItems: "flex-start", marginBottom: "16px", paddingRight: "20px" }}>
            {selectedPlace.photoUrl ? (
              <img src={selectedPlace.photoUrl} alt="place" style={{ width: "80px", height: "80px", objectFit: "cover", borderRadius: "12px", flexShrink: 0, border: "1px solid #eee" }} />
            ) : (
              <div style={{ width: "80px", height: "80px", backgroundColor: "#f2f2f2", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "30px", flexShrink: 0 }}>
                {getCategoryIcon(selectedPlace.types)}
              </div>
            )}
            
            <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", alignItems: "flex-start", textAlign: "left" }}>
              <h3 style={{ margin: "0 0 4px 0", fontSize: "16px", color: "#242424", fontWeight: 700, lineHeight: 1.3, wordBreak: "keep-all" }}>
                {getCategoryIcon(selectedPlace.types)} {selectedPlace.name || t.defaultName}
              </h3>
              
              {selectedPlace.rating && (
                <div style={{ fontSize: "13px", color: "#555", display: "flex", alignItems: "center", gap: "4px", marginBottom: "6px" }}>
                  <span style={{ color: "#f5a623" }}>★</span> 
                  <span style={{ fontWeight: 600 }}>{selectedPlace.rating}</span>
                  <span style={{ color: "#999" }}>({selectedPlace.user_ratings_total})</span>
                </div>
              )}

              <div style={{ fontSize: "14px", color: "#555", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                📍 {selectedPlace.formatted_address || t.addressError}
              </div>
            </div>
          </div>

          <hr style={{ border: "none", borderTop: "1px solid #eee", margin: "0 0 16px 0" }} />

          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: "16px", rowGap: "8px", marginBottom: "12px", fontSize: "13px" }}>
            
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "12px" }}>
                {selectedPlace.opening_hours.isOpen ? "🟢" : "🔴"}
              </span>
              <span style={{ color: "#3c4043", fontWeight: 500 }}>
                {getTodayHours(selectedPlace.opening_hours.weekdayText) || (selectedPlace.opening_hours.isOpen ? "영업 중" : "영업 종료")}
              </span>
            </div>

            {selectedPlace.formatted_phone_number && (
              <div style={{ display: "flex", alignItems: "center" }}>
                <span style={{ color: "#70757a", marginRight: "6px" }}>📞</span>
                <span style={{ color: "#3c4043", marginRight: "6px" }}>{selectedPlace.formatted_phone_number}</span>
                <button onClick={() => handleCopyPhone(selectedPlace.formatted_phone_number)} style={{ border: "1px solid #dadce0", background: "white", color: "#1a73e8", borderRadius: "100px", fontSize: "11px", padding: "2px 8px", cursor: "pointer", fontWeight: 500 }}>
                  {t.copy}
                </button>
              </div>
            )}
          </div>

          <div style={{ marginBottom: "16px" }}>
            <textarea 
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder={t.memoPlaceholder}
              style={{ width: "100%", height: "60px", padding: "10px", boxSizing: "border-box", borderRadius: "8px", border: "1px solid #e0e0e0", fontSize: "13px", resize: "none", backgroundColor: "#f9f9f9", color: "#333", fontFamily: "inherit" }}
            />
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            {isSaved ? (
              <>
                <button onClick={handleDeletePlace} disabled={isLoadingApi} style={{ flex: 1, padding: "12px", backgroundColor: "#fce8e6", color: "#d93025", border: "none", borderRadius: "8px", fontWeight: "bold", fontSize: "14px", cursor: isLoadingApi ? "not-allowed" : "pointer", opacity: isLoadingApi ? 0.7 : 1 }}>
                  {isLoadingApi ? "처리중..." : t.delete}
                </button>
                <button onClick={handleSavePlace} disabled={isLoadingApi} style={{ flex: 1, padding: "12px", backgroundColor: "#1a73e8", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", fontSize: "14px", cursor: isLoadingApi ? "not-allowed" : "pointer", boxShadow: "0 1px 2px rgba(60,64,67,0.3)", opacity: isLoadingApi ? 0.7 : 1 }}>
                  {isLoadingApi ? "처리중..." : t.update}
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setShowDetails(false)} style={{ flex: 1, padding: "12px", backgroundColor: "#f1f3f4", color: "#3c4043", border: "none", borderRadius: "8px", fontWeight: "bold", fontSize: "14px", cursor: "pointer" }}>
                  {t.cancel}
                </button>
                <button onClick={handleSavePlace} disabled={isLoadingApi} style={{ flex: 1, padding: "12px", backgroundColor: "#1a73e8", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", fontSize: "14px", cursor: isLoadingApi ? "not-allowed" : "pointer", boxShadow: "0 1px 2px rgba(60,64,67,0.3)", opacity: isLoadingApi ? 0.7 : 1 }}>
                  {isLoadingApi ? "처리중..." : t.save}
                </button>
              </>
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