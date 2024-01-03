import { AfterViewInit, Directive, Input } from "@angular/core";

@Directive({
    selector: '[selectTrack]'
})
export class SelectTrackDirective implements AfterViewInit {
    private el: HTMLElement;

    @Input('selectTrack') selectedTrack: any;

    ngAfterViewInit(): void {
        if (this.selectedTrack) {
            setTimeout(() => {
                document.getElementById('list-' + this.selectedTrack)?.scrollIntoView({
                behavior: "smooth",
                block: "center"
            });}, 100);
            
        }
        //.parentElement.style.display

    }

}