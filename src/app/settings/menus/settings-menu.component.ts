import { Component, Input, OnInit } from '@angular/core';

@Component({
  selector: 'mmn-settings-menu',
  templateUrl: './settings-menu.component.html',
  styleUrls: ['./settings-menu.component.scss']
})
export class SettingsMenuComponent implements OnInit {
  @Input() index: number;
  label: string;
  menuLabels: string[] = [];
  icons = [
    'camera',
    'queue_play_next',
    'search',
    'remove_red_eye'
  ];
  defaultLabels = [
    'mmn.layout.mockAndRecord',
    'mmn.layout.spyAndReplay',
    'mmn.layout.trackResources',
    'mmn.layout.searchElements'
  ]

  constructor() { }

  ngOnInit(): void {
    chrome.storage.local.get(['settings'], results => {
      if (results['settings']) {
        this.menuLabels = results['settings'];
        this.label = this.menuLabels[this.index];
      } else {
        chrome.storage.local.set({ settings: [] });
      }
    });

  }

  deleteLabel() {
    chrome.storage.local.get(['settings'], results => {
      if (results['settings']) {
        this.menuLabels = results['settings'];
        this.label = '';
        this.menuLabels[this.index] = '';
        chrome.storage.local.set({ settings: this.menuLabels });
      }
    });
    

  }

  labelChange(label){
    chrome.storage.local.get(['settings'], results => {
      if (results['settings']) {
        this.menuLabels = results['settings'];
        this.menuLabels[this.index] = label;
        chrome.storage.local.set({ settings: this.menuLabels });
        chrome.storage.local.set({ settings: this.menuLabels });
      }
    });
  }

}
