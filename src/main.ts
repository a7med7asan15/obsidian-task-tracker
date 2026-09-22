import { Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, mergeSettings } from './settings/defaults';
import type { TaskTrackerSettings } from './settings/types';

export default class TaskTrackerPlugin extends Plugin {
  settings: TaskTrackerSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    this.settings = mergeSettings(await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
