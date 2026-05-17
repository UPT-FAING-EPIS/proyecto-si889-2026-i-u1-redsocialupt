(function () {
  const shared = window.UPTAppShared;

  if (!shared) {
    throw new Error('No se cargaron las utilidades compartidas antes de live media');
  }

  const { isDesktopClient } = shared;

  function getLiveAudioConstraints() {
    return {
      echoCancellation: { ideal: true },
      noiseSuppression: { ideal: true },
      autoGainControl: { ideal: true },
      channelCount: { ideal: 1 },
      sampleRate: { ideal: 48000 },
      sampleSize: { ideal: 16 },
    };
  }

  function getLiveVideoConstraints(source, overrides = {}) {
    const desktop = isDesktopClient();
    const base = source === 'screen'
      ? {
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 },
          frameRate: { ideal: 60, max: 60 },
        }
      : desktop
        ? {
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            frameRate: { ideal: 60, max: 60 },
            aspectRatio: { ideal: 16 / 9 },
          }
        : {
            width: { ideal: 1280, max: 1280 },
            height: { ideal: 720, max: 720 },
            frameRate: { ideal: 24, max: 30 },
          };

    return { ...base, ...overrides };
  }

  function applyLiveTrackHints(stream, source) {
    if (!stream?.getTracks) {
      return;
    }

    stream.getVideoTracks().forEach((track) => {
      try {
        track.contentHint = source === 'screen' ? 'detail' : 'motion';
      } catch (_error) {}
    });

    stream.getAudioTracks().forEach((track) => {
      try {
        track.contentHint = 'speech';
      } catch (_error) {}
    });
  }

  function createMixedAudioTrack(displayAudioTrack, micAudioTrack) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass || !displayAudioTrack || !micAudioTrack) {
      return null;
    }

    try {
      let audioContext;
      try {
        audioContext = new AudioContextClass({ sampleRate: 48000 });
      } catch (_error) {
        audioContext = new AudioContextClass();
      }

      const destination = audioContext.createMediaStreamDestination();
      const compressor = audioContext.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 24;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;

      const displaySource = audioContext.createMediaStreamSource(new MediaStream([displayAudioTrack]));
      const micSource = audioContext.createMediaStreamSource(new MediaStream([micAudioTrack]));
      const systemGainNode = audioContext.createGain();
      const micGainNode = audioContext.createGain();
      systemGainNode.gain.value = 0.85;
      micGainNode.gain.value = 1;

      displaySource.connect(systemGainNode).connect(compressor);
      micSource.connect(micGainNode).connect(compressor);
      compressor.connect(destination);

      const mixedTrack = destination.stream.getAudioTracks()[0] || null;
      if (mixedTrack) {
        try {
          mixedTrack.contentHint = 'speech';
        } catch (_error) {}
      }

      if (audioContext.state === 'suspended') {
        audioContext.resume().catch(() => {});
      }

      return {
        audioContext,
        systemGainNode,
        micGainNode,
        mixedTrack,
      };
    } catch (error) {
      console.warn('No se pudo crear la mezcla optimizada de audio:', error);
      return null;
    }
  }

  window.UPTLiveMedia = {
    getLiveAudioConstraints,
    getLiveVideoConstraints,
    applyLiveTrackHints,
    createMixedAudioTrack,
  };
})();
