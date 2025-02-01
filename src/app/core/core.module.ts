import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
    MatBottomSheetModule,
} from '@angular/material/bottom-sheet';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule, MatIconRegistry } from '@angular/material/icon';
import { RouterModule } from '@angular/router';
import { FlexLayoutModule } from '@ngbracket/ngx-layout';
import { TranslateModule } from '@ngx-translate/core';
import { NgxJsonViewerModule } from 'ngx-json-viewer';

import { JsonViewerComponent } from './json-viewer/json-viewer.component';
import { LayoutComponent } from './layout/layout.component';
import { RateSupportComponent } from './layout/rate-support/rate-support.component';

@NgModule({
    imports: [CommonModule, RouterModule, FormsModule, TranslateModule, FlexLayoutModule, NgxJsonViewerModule, MatIconModule, MatButtonModule, MatBottomSheetModule, LayoutComponent, RateSupportComponent, JsonViewerComponent],
    exports: [LayoutComponent, RateSupportComponent, TranslateModule, FlexLayoutModule, NgxJsonViewerModule, MatIconModule],
    providers: [MatIconRegistry]
})
export class CoreModule { }
