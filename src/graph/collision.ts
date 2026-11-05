import { CollisionPriority, CollisionType } from "@dnd-kit/abstract";
import { pointerIntersection, type CollisionDetector } from "@dnd-kit/collision";
import { Point, Rectangle } from "@dnd-kit/geometry";

export const DRAG_LABEL = "data-drag-label";

/** A target is hit by the pointer, or else by the visible drag label: the larger and closer the overlap, the better. */
export const labelIntersection: CollisionDetector = (input) => {
  const hit = pointerIntersection(input);
  if (hit) return hit;

  const bounds = document.querySelector(`[${DRAG_LABEL}]`)?.getBoundingClientRect();
  const { shape } = input.droppable;
  if (!bounds || !shape) return null;

  const label = new Rectangle(bounds.left, bounds.top, bounds.width, bounds.height);
  const area = label.intersectionArea(shape);
  if (!area) return null;

  const ratio = area / (label.area + shape.area - area);
  const distance = Point.distance(shape.center, input.dragOperation.position.current);
  return { id: input.droppable.id, value: ratio / distance, type: CollisionType.ShapeIntersection, priority: CollisionPriority.Normal };
};
