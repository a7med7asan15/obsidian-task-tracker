import { Plugin } from 'obsidian';

export default class TaskTrackerPlugin extends Plugin {
  async onload(): Promise<void> {
    console.log('Task Tracker loaded');
  }
}
