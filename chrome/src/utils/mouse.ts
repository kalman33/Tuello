let mouseDiv: HTMLDivElement | null = null;

function mouseListener(event: MouseEvent) {
  if (mouseDiv && event.pageX && event.pageY) {
    mouseDiv.innerHTML = `${event.pageX}, ${event.pageY}`;
  }
}

export function addMouseCoordinates() {
  // Deux activations successives laissaient une div orpheline dans la page
  removeMouseCoordinates();

  document.addEventListener('mousemove', mouseListener);
  mouseDiv = document.createElement('div');
  mouseDiv.id = 'mouseCoordinates';
  mouseDiv.style.setProperty('margin', '0px', 'important');
  mouseDiv.style.setProperty('position', 'fixed', 'important');
  mouseDiv.style.setProperty('padding', '0px', 'important');
  mouseDiv.style.setProperty('right', '10px', 'important');
  mouseDiv.style.setProperty('top', '10px', 'important');
  mouseDiv.style.setProperty('z-index', '9999', 'important');
  mouseDiv.style.setProperty('background-color', 'rgba(0, 0, 0, 0.7)', 'important');
  mouseDiv.style.setProperty('color', 'white', 'important');
  mouseDiv.style.setProperty('font-size', '12px', 'important');
  document.body.appendChild(mouseDiv);
}

export function removeMouseCoordinates() {
  document.removeEventListener('mousemove', mouseListener);
  mouseDiv?.remove();
  mouseDiv = null;
}
