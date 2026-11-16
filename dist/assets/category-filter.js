const filter = document.querySelector('.category-filter');
const trigger = filter.querySelector('summary');
const error = filter.querySelector('.category-error');

function closeFilter() {
  filter.open = false;
  trigger.focus({ preventScroll: true });
}

filter.addEventListener('click', event => {
  if (event.target.matches('input[type="radio"]')) closeFilter();
});

filter.addEventListener('change', () => {
  if (error) error.hidden = true;
});

filter.addEventListener('invalid', event => {
  event.preventDefault();
  if (error) error.hidden = false;
  filter.open = true;
  trigger.focus({ preventScroll: true });
}, true);

document.addEventListener('pointerdown', event => {
  if (filter.open && !filter.contains(event.target)) filter.open = false;
});

filter.addEventListener('keydown', event => {
  if (event.key === 'Escape' && filter.open) {
    event.preventDefault();
    closeFilter();
  }
  if (event.key === 'Enter' && event.target.matches('input[type="radio"]')) {
    event.preventDefault();
    event.target.click();
  }
});
