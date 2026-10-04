import { useState } from 'react';
import BarcodeScanner from './BarcodeScanner';
import ScanningTools from './AddProductFields/ScanningTools';
import ProductFormFields from './AddProductFields/ProductFormFields';
import { useProductForm } from '../hooks/useProductForm';
import { useVoiceRecognition } from '../hooks/useVoiceRecognition';

const AddProduct = () => {
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);

  const {
    formData,
    setFormData,
    isUploading,
    isLoadingBarcode,
    scannedProductInfo,
    useBestBefore,
    setUseBestBefore,
    manufacturingDate,
    setManufacturingDate,
    bestBeforeMonths,
    setBestBeforeMonths,
    calculatedExpiryDate,
    handleFormSubmit,
    handleImageUpload,
    handleBarcodeScanned,
    conflictInfo,
    setConflictInfo
  } = useProductForm();

  const {
    isListening,
    voiceTranscript,
    audioLevel,
    isProcessingVoice,
    handleMicClick
  } = useVoiceRecognition((voiceData) => {
    setFormData(prev => ({ ...prev, ...voiceData }));
  });

  return (
    <>
      <div className="max-w-6xl mx-auto py-8 relative">
        {conflictInfo && (
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center rounded-3xl">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in zoom-in duration-200">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center text-rose-600">
                  <span className="font-bold text-xl">!</span>
                </div>
                <h3 className="text-xl font-bold text-slate-900">Conflict Detected</h3>
              </div>
              <p className="text-slate-600 mb-6 font-medium">
                {conflictInfo.message}
              </p>
              
              {conflictInfo.type === 'duplicate_conflict' && (
                <div className="bg-slate-50 rounded-xl p-4 mb-6 border border-slate-100">
                  <div className="mb-3">
                    <p className="text-xs font-bold text-slate-400 uppercase">Existing Item Date</p>
                    <p className="text-sm font-semibold text-slate-700">{conflictInfo.existing_date}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase">New Scanned Date</p>
                    <p className="text-sm font-semibold text-indigo-600">{conflictInfo.new_date}</p>
                  </div>
                </div>
              )}

              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setConflictInfo(null)}
                  className="px-4 py-2 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                {conflictInfo.type === 'duplicate_conflict' && (
                  <button
                    type="button"
                    onClick={() => handleFormSubmit(null, { force_save: true, overwrite_id: conflictInfo.existing_id })}
                    className="px-4 py-2 rounded-xl font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                  >
                    Overwrite Existing
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleFormSubmit(null, { force_save: true })}
                  className="px-4 py-2 rounded-xl font-bold bg-slate-900 text-white hover:bg-slate-800 transition-colors"
                >
                  Keep Both (Force Save)
                </button>
              </div>
            </div>
          </div>
        )}
        
        <div className="mb-10 text-center lg:text-left px-4">
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">Add New Product</h1>
          <p className="text-slate-500 mt-2 text-lg">Use scanning tools or enter details manually.</p>
        </div>

        <form onSubmit={handleFormSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          <ScanningTools
            onBarcodeOpen={() => setShowBarcodeScanner(true)}
            isLoadingBarcode={isLoadingBarcode}
            barcode={formData.barcode}
            scannedProductInfo={scannedProductInfo}
            onImageUpload={handleImageUpload}
            isUploading={isUploading}
            imageUrl={formData.image_url}
          />

          <ProductFormFields
            formData={formData}
            setFormData={setFormData}
            isListening={isListening}
            handleMicClick={handleMicClick}
            audioLevel={audioLevel}
            voiceTranscript={voiceTranscript}
            isProcessingVoice={isProcessingVoice}
            useBestBefore={useBestBefore}
            setUseBestBefore={setUseBestBefore}
            manufacturingDate={manufacturingDate}
            setManufacturingDate={setManufacturingDate}
            bestBeforeMonths={bestBeforeMonths}
            setBestBeforeMonths={setBestBeforeMonths}
            calculatedExpiryDate={calculatedExpiryDate}
          />
        </form>
      </div>

      {showBarcodeScanner && (
        <BarcodeScanner
          onScan={handleBarcodeScanned}
          onClose={() => setShowBarcodeScanner(false)}
        />
      )}
    </>
  );
};

export default AddProduct;


