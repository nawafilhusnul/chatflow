"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

interface QRScannerProps {
  onScan: (scannedUserId: string) => void;
  onError?: (error: string) => void;
}

export default function QRScanner({ onScan, onError }: QRScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const html5QrCode = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    return () => {
      if (html5QrCode.current?.isScanning) {
        html5QrCode.current?.stop();
      }
    };
  }, []);

  const startScanning = async () => {
    try {
      const devices = await Html5Qrcode.getCameras();
      if (devices && devices.length) {
        const html5QrcodeScanner = new Html5Qrcode("reader");
        html5QrCode.current = html5QrcodeScanner;

        await html5QrcodeScanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
          },
          (decodedText) => {
            // Stop scanning after successful scan
            html5QrcodeScanner.stop();
            setIsScanning(false);
            onScan(decodedText);
          },
          (errorMessage) => {
            onError?.(errorMessage);
          }
        );

        setIsScanning(true);
      }
    } catch (err) {
      console.error("Error starting QR scanner:", err);
      onError?.("Failed to start camera");
    }
  };

  const stopScanning = () => {
    if (html5QrCode.current?.isScanning) {
      html5QrCode.current?.stop();
      setIsScanning(false);
    }
  };

  return (
    <div className="w-full max-w-sm mx-auto">
      <div id="reader" className="w-full"></div>
      <div className="mt-4 flex justify-center">
        {!isScanning ? (
          <button
            onClick={startScanning}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Start Scanning
          </button>
        ) : (
          <button
            onClick={stopScanning}
            className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
          >
            Stop Scanning
          </button>
        )}
      </div>
    </div>
  );
}
