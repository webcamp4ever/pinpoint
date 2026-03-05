'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import exifr from 'exif-js';

export default function ImageUploader() {
  const [status, setStatus] = useState('사진을 올려주세요');

  // 파일이 드롭되었을 때 실행되는 함수
  const onDrop = useCallback((acceptedFiles: File[]) => {
    acceptedFiles.forEach((file) => {
      setStatus(`${file.name} 분석 중...`);
      
      // 1. Exif(위치 정보) 추출 시도
      // @ts-ignore (exif-js 타입 이슈 무시)
      exifr.getData(file, function(this: any) {
        const lat = exifr.getTag(this, 'GPSLatitude');
        const lon = exifr.getTag(this, 'GPSLongitude');

        if (lat && lon) {
          // GPS 좌표 포맷 변환 (도/분/초 -> 십진수)
          const convertDMSToDD = (dms: number[], ref: string) => {
            let dd = dms[0] + dms[1] / 60 + dms[2] / 3600;
            if (ref === 'S' || ref === 'W') dd = dd * -1;
            return dd;
          };

          const latRef = exifr.getTag(this, 'GPSLatitudeRef') || 'N';
          const lonRef = exifr.getTag(this, 'GPSLongitudeRef') || 'E';

          const finalLat = convertDMSToDD(lat, latRef);
          const finalLon = convertDMSToDD(lon, lonRef);

          setStatus(`성공! 위도: ${finalLat.toFixed(6)}, 경도: ${finalLon.toFixed(6)}`);
          console.log('좌표:', finalLat, finalLon);
        } else {
          setStatus('이 사진에는 위치 정보(GPS)가 없습니다. 😭');
        }
      });
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  return (
    <div 
      {...getRootProps()} 
      className={`p-10 border-4 border-dashed rounded-xl text-center cursor-pointer transition-colors
        ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}`}
    >
      <input {...getInputProps()} />
      {isDragActive ? (
        <p className="text-blue-600 font-bold">여기에 사진을 놓아주세요!</p>
      ) : (
        <p className="text-gray-500">
          사진을 클릭하거나 이곳으로 드래그하세요.<br/>
          <span className="text-sm">(위치 정보가 포함된 사진이어야 합니다)</span>
        </p>
      )}
      <div className="mt-4 font-semibold text-indigo-600">
        상태: {status}
      </div>
    </div>
  );
}