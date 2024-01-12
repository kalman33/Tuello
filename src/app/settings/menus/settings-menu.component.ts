import { Component, Input } from '@angular/core';

@Component({
  selector: 'mmn-settings-menu',
  templateUrl: './settings-menu.component.html',
  styleUrls: ['./settings-menu.component.scss']
})
export class SettingsMenuComponent {
  @Input() index: number;

  constructor() { }

}
