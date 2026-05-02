"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

type ChartFrameProps = {
  height: number;
  children: (size: { width: number; height: number }) => ReactNode;
};

export function ChartFrame({ height, children }: ChartFrameProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const update = () => {
      setWidth(Math.max(0, Math.floor(element.getBoundingClientRect().width)));
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="min-w-0" style={{ height }}>
      {width > 0 ? children({ width, height }) : null}
    </div>
  );
}
