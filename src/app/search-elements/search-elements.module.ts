import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CoreModule } from '../core/core.module';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { DragDropModule } from '@angular/cdk/drag-drop';
import {FormsModule} from '@angular/forms';
import { SearchElementsRoutingModule } from './search-elements-routing.module';
import { ElementComponent } from './element/element.component';
import { SearchElementsComponent } from './search-elements.component';

@NgModule({
    imports: [CommonModule, CoreModule, FormsModule, SearchElementsRoutingModule, ScrollingModule, DragDropModule, ElementComponent, SearchElementsComponent]
})
export class SearchElementsModule {}
