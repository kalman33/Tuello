"use strict";
exports.__esModule = true;
exports.UserAction = void 0;
var UserAction = /** @class */ (function () {
    function UserAction(e) {
        if (e) {
            this.type = e.type;
            switch (this.type) {
                case 'click':
                    this.x = e.x;
                    this.y = e.y;
                    break;
                case 'scroll':
                    this.scrollX = window.scrollX;
                    this.scrollY = window.scrollY;
                    break;
                case 'input':
                    // getBoundingClientRect : method returns the size of an element and its position relative to the viewport.
                    var rect = e.target.getBoundingClientRect();
                    this.x = Math.ceil(getOffset(rect).left);
                    this.y = Math.ceil(getOffset(rect).top);
                    this.value = e.target.value;
                    break;
            }
        }
    }
    return UserAction;
}());
exports.UserAction = UserAction;
