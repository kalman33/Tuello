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
import { AngularMaterialModule } from '../angular-material.module';
import { JsonViewerComponent } from './json-viewer/json-viewer.component';
import { LayoutComponent } from './layout/layout.component';
import { RateSupportComponent } from './layout/rate-support/rate-support.component';

@NgModule({
    declarations: [LayoutComponent, RateSupportComponent, JsonViewerComponent],
    imports: [CommonModule, RouterModule, FormsModule, AngularMaterialModule, TranslateModule, FlexLayoutModule, NgxJsonViewerModule, MatIconModule, MatButtonModule, MatBottomSheetModule],
    exports: [LayoutComponent, RateSupportComponent, AngularMaterialModule, TranslateModule, FlexLayoutModule, NgxJsonViewerModule, MatIconModule],
    providers: [MatIconRegistry]
})
export class CoreModule { }
