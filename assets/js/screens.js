// The screens strip scrolls natively; the buttons step it one screen at a time for mouse users.

export function initScreens(root) {
  const list = root.querySelector(".screens__list");
  const previous = root.querySelector("[data-screens-prev]");
  const next = root.querySelector("[data-screens-next]");
  const items = [...list.children];

  const step = (direction) => {
    const start = list.getBoundingClientRect().left + parseFloat(getComputedStyle(list).scrollPaddingLeft || "0");
    const current = items.findIndex((item) => item.getBoundingClientRect().left >= start - 4);
    const target = items[Math.max(0, Math.min(items.length - 1, (current === -1 ? items.length - 1 : current) + direction))];
    list.scrollTo({ left: target.offsetLeft - items[0].offsetLeft, behavior: "smooth" });
  };

  const update = () => {
    const atStart = list.scrollLeft <= 2;
    const atEnd = list.scrollLeft + list.clientWidth >= list.scrollWidth - 2;
    previous.setAttribute("aria-disabled", String(atStart));
    next.setAttribute("aria-disabled", String(atEnd));
  };

  previous.addEventListener("click", () => step(-1));
  next.addEventListener("click", () => step(1));
  list.addEventListener("scroll", update, { passive: true });
  addEventListener("resize", update);
  update();
}
