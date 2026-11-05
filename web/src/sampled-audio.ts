import { WorkletSynthesizer, Sequencer } from 'spessasynth_lib';
import processorUrl from 'spessasynth_lib/dist/spessasynth_processor.min.js?url';
import { loadSoundBank, type SoundStatus } from './sound-cache';
import { sampledSequence } from './sampled-sequence';
import type { Song } from './music';
export class SampledAudio {
  private synth: WorkletSynthesizer;
  private sequencer: Sequencer;
  private silent = false;
  private serial = Promise.resolve();
  private constructor(context: AudioContext, destination: AudioNode) {
    this.synth = new WorkletSynthesizer(context);
    this.synth.setLogLevel(false, true, false);
    this.synth.connect(destination);
    this.synth.setSystemParameter('voiceCap', 256);
    this.synth.setSystemParameter('reverbGain', .35);
    this.synth.setSystemParameter('chorusGain', 0);
    this.sequencer = new Sequencer(this.synth, { skipToFirstNoteOn: false });
    this.sequencer.loopCount = 0;
  }
  static async create(context: AudioContext, destination: AudioNode, report: (status: SoundStatus) => void) {
    if (!context.audioWorklet) throw new Error('Sampled instruments are unavailable in this browser. Choose Simple tones to play.');
    const [bytes] = await Promise.all([loadSoundBank(report), context.audioWorklet.addModule(processorUrl)]);
    const audio = new SampledAudio(context, destination);
    try {
      await audio.synth.soundBankManager.addSoundBank(bytes, 'generaluser');
      await audio.synth.isReady;
      return audio;
    } catch (error) { audio.destroy(); throw error; }
  }
  prepare(song: Song, offset: number, muted: Set<number>, pianoOnly: boolean) {
    const task = this.serial.then(async () => {
      this.pause();
      const sequence = sampledSequence(song, offset, muted, pianoOnly);
      this.silent = sequence.count === 0;
      if (this.silent) return;
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => { this.sequencer.eventHandler.removeEvent('songChange', 'scoreplay-load'); reject(new Error('The instrument player took too long to prepare this piece. Please try again.')); }, 20000);
        this.sequencer.eventHandler.addEvent('songChange', 'scoreplay-load', () => { clearTimeout(timeout); this.sequencer.eventHandler.removeEvent('songChange', 'scoreplay-load'); resolve(); });
        this.sequencer.loadNewSongList([{ binary: sequence.binary, fileName: song.title }]);
      });
    });
    this.serial = task.catch(() => {});
    return task;
  }
  play(speed: number) { if (!this.silent) { this.sequencer.playbackRate = speed; this.sequencer.play(); } }
  pause() { this.sequencer.pause(); this.synth.stopAll(true); }
  finish() { this.sequencer.pause(); } // Let release samples and room ambience finish naturally.
  destroy() { this.synth.destroy(); }
}
