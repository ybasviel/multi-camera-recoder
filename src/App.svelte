<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { FFmpeg } from '@ffmpeg/ffmpeg';
  import { toBlobURL, fetchFile } from '@ffmpeg/util';
  import coreURL from "@ffmpeg/core?url";
  import wasmURL from "@ffmpeg/core/wasm?url";
  import Logger from './components/Logger.svelte';

  
  // 型定義
  interface VideoDevice {
    deviceId: string;
    label: string;
    kind: string;
  }
  
  // 状態管理
  let videoDevices = $state<VideoDevice[]>([]);
  let selectedDevices = $state<Record<string, boolean>>({});
  let previewStreams = $state<Record<string, MediaStream>>({});
  let recorders = $state<Record<string, MediaRecorder>>({});
  let recordedChunks = $state<Record<string, Blob[]>>({});
  let isRecording = $state(false);
  let isConverting = $state(false);
  let conversionProgress = $state(0);
  let conversionStatus = $state('');
  
  // FFmpegインスタンス
  let ffmpeg = $state<FFmpeg | null>(null);
  let ffmpegLoaded = $state(false);
  
  let processingLogs = $state<string[]>([]);
  
  // 言語設定
  type Language = 'en' | 'ja';
  let currentLanguage = $state<Language>('ja');
  
  // 翻訳テーブル
  const translations = {
    en: {
      title: 'Multi Camera Recorder',
      cameraSelection: 'Camera Selection',
      noCameras: 'No cameras found',
      preview: 'Preview',
      selectCamera: 'Select a camera',
      recording: 'Recording',
      startRecording: 'Start Recording',
      stopRecording: 'Stop Recording',
      save: 'Save',
      loadingFFmpeg: 'Loading FFmpeg...',
      processingLogs: 'Processing Logs',
      conversionStarted: 'Conversion started...',
      inputFileLoading: 'Loading input file...',
      inputFileLoaded: 'Input file loaded',
      ffmpegWriteComplete: 'FFmpeg input file write completed',
      conversionProgress: 'Conversion progress: {progress}%',
      ffmpegCommandStart: 'FFmpeg command execution started...',
      ffmpegCommandComplete: 'FFmpeg conversion completed successfully',
      outputFileDetails: 'Output file details:',
      videoCodec: 'Video codec: H.264 (libx264)',
      audioCodec: 'Audio codec: AAC',
      frameRate: 'Frame rate: 60fps',
      gopSize: 'GOP size: 30 frames',
      quality: 'Quality: CRF 23',
      outputFileLoading: 'Loading output file...',
      outputFileSize: 'Output file size: {size}MB',
      mp4FileSize: 'MP4 file size: {size}MB',
      emptyFileError: 'Generated MP4 file is empty',
      saveDialog: 'Showing file save dialog...',
      fileWritingStart: 'File writing started...',
      fileWritingComplete: 'File writing completed',
      fallbackDownload: 'File system API is not available, so we will use the old method to download',
      downloadComplete: 'Download completed',
      cleanupStart: 'Cleanup started...',
      cleanupComplete: 'Cleanup completed',
      errorOccurred: 'An error occurred: {error}',
      saveFailed: 'Failed to save recording: {error}',
      saveFailedGeneric: 'Failed to save recording'
    },
    ja: {
      title: 'マルチカメラレコーダー',
      cameraSelection: 'カメラ選択',
      noCameras: 'カメラが見つかりません',
      preview: 'プレビュー',
      selectCamera: 'カメラを選択してください',
      recording: '録画中',
      startRecording: '録画開始',
      stopRecording: '録画停止',
      save: '保存',
      loadingFFmpeg: 'FFmpegをロード中...',
      processingLogs: '処理ログ',
      conversionStarted: '変換処理を開始しています...',
      inputFileLoading: '入力ファイルの読み込みを開始...',
      inputFileLoaded: '入力ファイルの読み込み完了',
      ffmpegWriteComplete: 'FFmpegへの入力ファイル書き込み完了',
      conversionProgress: '変換進捗: {progress}%',
      ffmpegCommandStart: 'FFmpeg変換コマンドの実行を開始...',
      ffmpegCommandComplete: 'FFmpeg変換が正常に完了しました',
      outputFileDetails: '出力ファイルの詳細:',
      videoCodec: 'ビデオコーデック: H.264 (libx264)',
      audioCodec: 'オーディオコーデック: AAC',
      frameRate: 'フレームレート: 60fps',
      gopSize: 'GOPサイズ: 30フレーム',
      quality: '品質: CRF 23',
      outputFileLoading: '出力ファイルの読み込みを開始...',
      outputFileSize: '出力ファイルサイズ: {size}MB',
      mp4FileSize: 'MP4ファイルサイズ: {size}MB',
      emptyFileError: '生成されたMP4ファイルが空です',
      saveDialog: 'ファイル保存ダイアログを表示します...',
      fileWritingStart: 'ファイルの書き込みを開始...',
      fileWritingComplete: 'ファイルの書き込みが完了しました',
      fallbackDownload: 'ファイルシステムAPIが利用できないため、従来の方法でダウンロードします',
      downloadComplete: 'ダウンロードが完了しました',
      cleanupStart: '一時ファイルのクリーンアップを開始...',
      cleanupComplete: 'クリーンアップが完了しました',
      errorOccurred: 'エラーが発生しました: {error}',
      saveFailed: '録画の保存に失敗しました: {error}',
      saveFailedGeneric: '録画の保存に失敗しました'
    }
  };
  
  // 翻訳関数
  function t(key: keyof typeof translations.en, params: Record<string, string> = {}): string {
    let text = translations[currentLanguage][key];
    Object.entries(params).forEach(([key, value]) => {
      text = text.replace(`{${key}}`, value);
    });
    return text;
  }
  
  // 言語切り替え関数
  function toggleLanguage() {
    currentLanguage = currentLanguage === 'en' ? 'ja' : 'en';
  }
  
  // カメラデバイスの取得
  async function getVideoDevices() {
    try {
      // まずカメラへのアクセス許可を取得
      await navigator.mediaDevices.getUserMedia({ video: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      videoDevices = devices.filter(device => device.kind === 'videoinput') as VideoDevice[];
    } catch (error: unknown) {
      console.error('カメラデバイスの取得に失敗:', error);
    }
  }
  
  // カメラのプレビューを開始
  async function startPreview(deviceId: string) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      previewStreams[deviceId] = stream;
    } catch (error: unknown) {
      console.error('プレビューの開始に失敗:', error);
      if (error instanceof Error) {
        alert(`カメラの初期化に失敗しました: ${error.message}`);
      }
    }
  }
  
  // カメラのプレビューを停止
  function stopPreview(deviceId: string) {
    if (previewStreams[deviceId]) {
      previewStreams[deviceId].getTracks().forEach((track: MediaStreamTrack) => track.stop());
      delete previewStreams[deviceId];
    }
  }
  
  // デバイス選択のハンドラー
  function handleDeviceSelection() {
    for (const deviceId in selectedDevices) {
      if (selectedDevices[deviceId]) {
        if (!previewStreams[deviceId]) {
          startPreview(deviceId);
        }
      } else {
        stopPreview(deviceId);
      }
    }
  }
  
  // 録画開始
  async function startRecording() {
    isRecording = true;
    for (const deviceId in previewStreams) {
      const stream = previewStreams[deviceId];
      recordedChunks[deviceId] = [];
      const recorder = new MediaRecorder(stream);
      recorders[deviceId] = recorder;
      
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunks[deviceId].push(event.data);
        }
      };
      
      recorder.start();
    }
  }
  
  // 録画停止
  function stopRecording() {
    isRecording = false;
    for (const deviceId in recorders) {
      const recorder = recorders[deviceId];
      recorder.stop();
      delete recorders[deviceId];
    }
  }
  
  // FFmpegの初期化
  async function loadFFmpeg() {
    try {
      ffmpeg = new FFmpeg();
      
      // baseURLとwasmファイルの場所を設定
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
      await ffmpeg.load({
          coreURL, 
          wasmURL
          });
      
      ffmpegLoaded = true;
    } catch (error: unknown) {
      console.error('FFmpegのロードに失敗:', error);
    }
  }
  
  // コンポーネントのマウント時に初期化
  onMount(async () => {
    await loadFFmpeg();
    await getVideoDevices();
  });
  
  // コンポーネントのアンマウント時にクリーンアップ
  onDestroy(() => {
    for (const deviceId in previewStreams) {
      stopPreview(deviceId);
    }
  });
  
  // ログを追加する関数
  function addLog(message: string) {
    processingLogs = [...processingLogs, `${new Date().toLocaleTimeString()}: ${message}`];
    if (processingLogs.length > 50) {
      processingLogs = processingLogs.slice(-50);
    }
  }
  
  // 録画の保存
  async function saveRecordings() {
    if (!ffmpegLoaded || !ffmpeg) {
      alert('FFmpegがロードされていません。');
      return;
    }
    
    processingLogs = [];
    addLog(t('conversionStarted'));
    addLog('録画の保存処理を開始します...');
    
    for (const deviceId in recordedChunks) {
      if (recordedChunks[deviceId].length > 0) {
        addLog(`デバイス ${deviceId} の録画データを処理中...`);
        addLog(`チャンク数: ${recordedChunks[deviceId].length}`);
        
        const blob = new Blob(recordedChunks[deviceId], { type: 'video/webm' });
        addLog(`WebMファイルサイズ: ${(blob.size / 1024 / 1024).toFixed(2)}MB`);
        
        const deviceName = videoDevices.find(d => d.deviceId === deviceId)?.label || deviceId;
        const safeDeviceName = deviceName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const fileName = `recording_${safeDeviceName}_${new Date().toISOString().replace(/[:.]/g, '-')}.mp4`;
        
        try {
          isConverting = true;
          conversionProgress = 0;
          conversionStatus = '変換処理を開始しています...';
          
          addLog(t('inputFileLoading'));
          const inputData = await fetchFile(blob);
          addLog(t('inputFileLoaded'));
          
          await ffmpeg.writeFile('input.webm', inputData);
          addLog(t('ffmpegWriteComplete'));
          
          ffmpeg.on('progress', ({ progress }) => {
            addLog(t('conversionProgress', { progress: Math.round(progress * 100).toString() }));
          });
          
          addLog(t('ffmpegCommandStart'));
          await ffmpeg.exec([
            '-i', 'input.webm',
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-tune', 'zerolatency',
            '-crf', '23',
            '-r', '60',
            '-g', '30',
            '-keyint_min', '30',
            '-sc_threshold', '0',
            '-c:a', 'aac',
            '-b:a', '128k',
            'output.mp4'
          ]);
          addLog(t('ffmpegCommandComplete'));
          addLog(t('outputFileDetails'));
          addLog(t('videoCodec'));
          addLog(t('audioCodec'));
          addLog(t('frameRate'));
          addLog(t('gopSize'));
          addLog(t('quality'));
          
          addLog(t('outputFileLoading'));
          const data = await ffmpeg.readFile('output.mp4');
          addLog(t('outputFileSize', { size: ((data?.length || 0) / 1024 / 1024).toFixed(2) }));
          
          if (!data || data.length === 0) {
            throw new Error(t('emptyFileError'));
          }
          
          const videoBlob = new Blob([data], { type: 'video/mp4' });
          addLog(t('mp4FileSize', { size: (videoBlob.size / 1024 / 1024).toFixed(2) }));
          
          if (videoBlob.size === 0) {
            throw new Error(t('emptyFileError'));
          }
          
          try {
            addLog(t('saveDialog'));
            const handle = await window.showSaveFilePicker({
              suggestedName: fileName,
              types: [{
                description: 'MP4 Video',
                accept: { 'video/mp4': ['.mp4'] }
              }]
            });
            
            addLog(t('fileWritingStart'));
            const writable = await handle.createWritable();
            await writable.write(videoBlob);
            await writable.close();
            addLog(t('fileWritingComplete'));
            
          } catch (error) {
            addLog(t('fallbackDownload'));
            const url = URL.createObjectURL(videoBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            addLog(t('downloadComplete'));
          }
          
          addLog(t('cleanupStart'));
          await ffmpeg.deleteFile('input.webm');
          await ffmpeg.deleteFile('output.mp4');
          addLog(t('cleanupComplete'));
          
        } catch (error: unknown) {
          addLog(t('errorOccurred', { error: error instanceof Error ? error.message : 'Unknown error' }));
          if (error instanceof Error) {
            alert(t('saveFailed', { error: error.message }));
          } else {
            alert(t('saveFailedGeneric'));
          }
        } finally {
          isConverting = false;
          conversionProgress = 0;
          conversionStatus = '';
        }
      }
    }
  }
  
  // その他の関数は変更なし...
</script>

<div class="container mx-auto p-4">
  <div class="flex justify-between items-center mb-4">
    <h1 class="text-2xl font-bold">{t('title')}</h1>
    <div class="flex items-center space-x-2">
      <span class="text-sm {currentLanguage === 'en' ? 'text-gray-400' : 'text-gray-900'}">日本語</span>
      <button 
        type="button"
        role="switch"
        aria-checked={currentLanguage === 'ja'}
        class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 {currentLanguage === 'ja' ? 'bg-red-600' : 'bg-blue-600'}"
        onclick={toggleLanguage}
      >
        <span
          class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out {currentLanguage === 'ja' ? 'translate-x-5' : 'translate-x-0'}"
        />
      </button>
      <span class="text-sm {currentLanguage === 'ja' ? 'text-gray-400' : 'text-gray-900'}">English</span>
    </div>
  </div>
  
  <!-- デバイス選択セクション -->
  <div class="mb-6 bg-gray-100 p-4 rounded-lg">
    <h2 class="text-xl font-semibold mb-2">{t('cameraSelection')}</h2>
    {#if videoDevices.length === 0}
      <p class="text-gray-600">{t('noCameras')}</p>
    {:else}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {#each videoDevices as device}
          <div class="flex items-center space-x-2">
            <input 
              type="checkbox" 
              id={device.deviceId} 
              bind:checked={selectedDevices[device.deviceId]}
              onchange={handleDeviceSelection}
              disabled={isRecording}
              class="h-5 w-5"
            />
            <label for={device.deviceId} class="truncate">
              {device.label || `カメラ ${videoDevices.indexOf(device) + 1}`}
            </label>
          </div>
        {/each}
      </div>
    {/if}
  </div>
  
  <!-- プレビューセクション -->
  <div class="mb-6">
    <h2 class="text-xl font-semibold mb-2">{t('preview')}</h2>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each Object.entries(previewStreams) as [deviceId, stream]}
        <div class="bg-black rounded-lg overflow-hidden relative">
          <video 
            autoplay 
            playsinline
            muted
            srcObject={stream}
            class="w-full h-auto"
          ></video>
          <div class="absolute bottom-2 right-2 bg-black bg-opacity-50 text-white p-1 text-xs rounded">
            {videoDevices.find(d => d.deviceId === deviceId)?.label || `カメラ ${deviceId}`}
          </div>
          {#if isRecording}
            <div class="absolute top-2 left-2 flex items-center">
              <div class="h-3 w-3 bg-red-500 rounded-full animate-pulse mr-1"></div>
              <span class="text-white text-xs">{t('recording')}</span>
            </div>
          {/if}
        </div>
      {/each}
    </div>
    {#if Object.keys(previewStreams).length === 0}
      <p class="text-gray-600">{t('selectCamera')}</p>
    {/if}
  </div>
  
  <!-- 録画コントロール -->
  <div class="flex space-x-4">
    <button 
      onclick={startRecording}
      disabled={isRecording || Object.keys(previewStreams).length === 0 || !ffmpegLoaded}
      class="px-4 py-2 bg-red-600 text-white rounded-md disabled:bg-gray-400 disabled:cursor-not-allowed hover:bg-red-700"
    >
      {t('startRecording')}
    </button>
    <button 
      onclick={stopRecording}
      disabled={!isRecording}
      class="px-4 py-2 bg-gray-600 text-white rounded-md disabled:bg-gray-400 disabled:cursor-not-allowed hover:bg-gray-700"
    >
      {t('stopRecording')}
    </button>
    <button 
      onclick={saveRecordings}
      disabled={Object.keys(recordedChunks).length === 0 || isConverting}
      class="px-4 py-2 bg-blue-600 text-white rounded-md disabled:bg-gray-400 disabled:cursor-not-allowed hover:bg-blue-700"
    >
      {t('save')}
    </button>
  </div>
  
  {#if !ffmpegLoaded}
    <p class="mt-4 text-amber-600">{t('loadingFFmpeg')}</p>
  {/if}

    <div class="mt-4">
      {#if isConverting}
      <div class="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
        <div 
          class="bg-blue-600 h-2.5 rounded-full transition-all duration-300 animate-pulse" 
          style="width: 100%"
        ></div>
      </div>
      <p class="mt-2 text-sm text-gray-600">{conversionStatus}</p>
      {/if}
      
      <Logger 
        logs={processingLogs}
        title={t('processingLogs')}
      />
    </div>
</div>

<style>
  .container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 1rem;
  }
</style>