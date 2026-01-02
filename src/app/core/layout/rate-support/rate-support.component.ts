import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { MatIcon, MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { FlexModule } from '@ngbracket/ngx-layout/flex';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'mmn-rate-support',
  templateUrl: './rate-support.component.html',
  styleUrls: ['./rate-support.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FlexModule, MatIcon, FormsModule, TranslatePipe]
})
export class RateSupportComponent {
  constructor(
    private bottomSheetRef: MatBottomSheetRef<RateSupportComponent>,
    private matIconRegister: MatIconRegistry,
    private domSanitizer: DomSanitizer,
    public translate: TranslateService
  ) {
    this.matIconRegister.addSvgIcon('github', this.domSanitizer.bypassSecurityTrustResourceUrl('/assets/img/github-mark.png'));
    this.matIconRegister.addSvgIcon('chrome', this.domSanitizer.bypassSecurityTrustResourceUrl('/assets/img/chrome.svg'));
  }

  openLink(event: MouseEvent): void {
    this.bottomSheetRef.dismiss();
  }

  faireUnDon() {
    this.bottomSheetRef.dismiss();
    document.forms['paypal'].submit();
  }
}
