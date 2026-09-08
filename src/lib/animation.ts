/**
 * Copyright 2022-2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import chalk from "chalk";

export interface AnimationStage {
  icon: string;
  verb: string;
}

export interface AnimationStream {
  write: (str: string) => any;
  isTTY?: boolean;
}

export interface AnimationOptions {
  stream?: AnimationStream;
  minDuration?: number;
  intervalMs?: number;
  stageDurationMs?: number;
  stages?: AnimationStage[];
  frames?: string[];
}

export class CliAnimation {
  public static readonly DEFAULT_STAGES: AnimationStage[] = [
    { icon: "🌱", verb: "aft is germinating..." },
    { icon: "🌿", verb: "aft is working..." },
    { icon: "⚡", verb: "aft is processing..." },
    { icon: "✨", verb: "aft is synthesizing..." },
    { icon: "🪴", verb: "aft is cultivating..." },
    { icon: "🍃", verb: "aft is scaffolding..." },
  ];

  public static readonly SPINNER_FRAMES = [
    "⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏",
  ];

  private stream: AnimationStream;
  private minDuration: number;
  private intervalMs: number;
  private stageDurationMs: number;
  private stages: AnimationStage[];
  private frames: string[];

  private timer: any = null;
  private startTime: number = 0;
  private isRunning: boolean = false;
  private frameIndex: number = 0;
  private forcedEnabled: boolean = false;
  private disabled: boolean = false;
  private exitHandlerRegistered: boolean = false;

  constructor(options?: AnimationOptions) {
    this.stream = options?.stream || (process.stderr as AnimationStream);
    this.minDuration = options?.minDuration ?? 2000;
    this.intervalMs = options?.intervalMs ?? 80;
    this.stageDurationMs = options?.stageDurationMs ?? 2000;
    this.stages = options?.stages || CliAnimation.DEFAULT_STAGES;
    this.frames = options?.frames || CliAnimation.SPINNER_FRAMES;
  }

  public setForcedEnabled(enabled: boolean): void {
    this.forcedEnabled = enabled;
  }

  public disable(): void {
    this.disabled = true;
    if (this.isRunning) {
      this.cleanup();
    }
  }

  public enable(): void {
    this.disabled = false;
  }

  public isEnabled(): boolean {
    if (this.disabled) return false;
    if (this.forcedEnabled) return true;
    if (process.env.NODE_ENV === "test") return false;
    if (process.env.CI) return false;
    if (process.env.AFT_NO_ANIMATION || process.env.NO_ANIMATION) return false;
    if (!process.stdout.isTTY || this.stream.isTTY === false) return false;
    return true;
  }

  public get running(): boolean {
    return this.isRunning;
  }

  public get isRunning(): boolean {
    return this.isRunning;
  }

  public get currentFrameIndex(): number {
    return this.frameIndex;
  }

  public start(customStages?: AnimationStage[]): void {
    if (this.isRunning) return;
    if (!this.isEnabled()) return;

    if (customStages && customStages.length > 0) {
      this.stages = customStages;
    }

    this.isRunning = true;
    this.startTime = Date.now();
    this.frameIndex = 0;

    if (!this.exitHandlerRegistered && typeof process !== "undefined" && process.once) {
      process.once("exit", () => this.cleanup());
      process.once("SIGINT", () => {
        this.cleanup();
        process.exit(130);
      });
      process.once("SIGTERM", () => {
        this.cleanup();
        process.exit(143);
      });
      this.exitHandlerRegistered = true;
    }

    try {
      this.stream.write("\x1b[?25l");
    } catch {}

    this.render();

    this.timer = setInterval(() => {
      this.frameIndex++;
      this.render();
    }, this.intervalMs);
  }

  public renderFrame(frameIdx?: number, elapsedMs?: number): string {
    const idx = frameIdx ?? this.frameIndex;
    const frame = this.frames[idx % this.frames.length];
    const elapsed =
      elapsedMs !== undefined
        ? elapsedMs
        : this.startTime > 0
          ? Date.now() - this.startTime
          : 0;
    const stageIdx =
      this.stageDurationMs > 0
        ? Math.floor(elapsed / this.stageDurationMs) % this.stages.length
        : 0;
    const stage = this.stages[stageIdx];
    const verb = stage.verb.toLowerCase().startsWith("aft is ")
      ? stage.verb
      : `aft is ${stage.verb.toLowerCase()}`;
    return `\r\x1b[K  ${stage.icon}  ${chalk.bold.magenta(frame)} ${chalk.cyan(verb)}`;
  }

  private render(): void {
    if (!this.isRunning) return;
    try {
      this.stream.write(this.renderFrame());
    } catch {}
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) return;

    const elapsed = Date.now() - this.startTime;
    if (this.isEnabled() && elapsed < this.minDuration) {
      await new Promise((resolve) => setTimeout(resolve, this.minDuration - elapsed));
    }

    this.cleanup();
  }

  public cleanup(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.isRunning) {
      try {
        this.stream.write("\r\x1b[K\x1b[?25h");
      } catch {}
      this.isRunning = false;
    }
  }
}

export const DEFAULT_STAGES = CliAnimation.DEFAULT_STAGES;
export const SPINNER_FRAMES = CliAnimation.SPINNER_FRAMES;

export default CliAnimation;
