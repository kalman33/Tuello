import { Component, OnInit } from '@angular/core';
import {
  MatBottomSheet,
  MatBottomSheetRef,
} from '@angular/material/bottom-sheet';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';

@Component({
  selector: 'mmn-rate-support',
  templateUrl: './rate-support.component.html',
  styleUrls: ['./rate-support.component.scss'],
})
export class RateSupportComponent implements OnInit {

  constructor(private bottomSheetRef: MatBottomSheetRef<RateSupportComponent>, private matIconRegister: MatIconRegistry, private domSanitizer: DomSanitizer) {
    this.matIconRegister.addSvgIcon('github', this.domSanitizer.bypassSecurityTrustResourceUrl('/assets/img/github-mark.png'));
    this.matIconRegister.addSvgIcon('chrome', this.domSanitizer.bypassSecurityTrustResourceUrl('/assets/img/chrome.svg'));
  }

  ngOnInit() {}

  openLink(event: MouseEvent): void {
    this.bottomSheetRef.dismiss();
  }
}
