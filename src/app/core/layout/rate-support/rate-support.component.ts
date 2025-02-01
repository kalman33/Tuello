import { Component, OnInit } from '@angular/core';
import {
  MatBottomSheet,
  MatBottomSheetRef,
} from '@angular/material/bottom-sheet';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { TranslateService, TranslateModule } from '@ngx-translate/core';
import { FormsModule } from '@angular/forms';
import { MatAnchor } from '@angular/material/button';
import { FlexModule } from '@ngbracket/ngx-layout/flex';
import { MatDialogTitle } from '@angular/material/dialog';

@Component({
    selector: 'mmn-rate-support',
    templateUrl: './rate-support.component.html',
    styleUrls: ['./rate-support.component.scss'],
    standalone: true,
    imports: [
        MatDialogTitle,
        FlexModule,
        MatAnchor,
        FormsModule,
        TranslateModule,
    ],
})
export class RateSupportComponent implements OnInit {

  constructor(private bottomSheetRef: MatBottomSheetRef<RateSupportComponent>, private matIconRegister: MatIconRegistry, private domSanitizer: DomSanitizer, public translate: TranslateService) {
    this.matIconRegister.addSvgIcon('github', this.domSanitizer.bypassSecurityTrustResourceUrl('/assets/img/github-mark.png'));
    this.matIconRegister.addSvgIcon('chrome', this.domSanitizer.bypassSecurityTrustResourceUrl('/assets/img/chrome.svg'));
  }

  ngOnInit() {}

  openLink(event: MouseEvent): void {
    this.bottomSheetRef.dismiss();
  }

  faireUnDon() {
    this.bottomSheetRef.dismiss();
    document.forms["paypal"].submit();
  }
}
