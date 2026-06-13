import { motion } from "framer-motion";
import type { ReactNode } from "react";

/** Horizontal scrolling section with a title, used across the home screen. */
export function Row({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="mb-8"
    >
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-base font-bold tracking-tight text-ink">{title}</h2>
        {action}
      </div>
      <div className="hide-scrollbar flex gap-4 overflow-x-auto pb-2 pl-1 pr-6 [scroll-padding:1rem]">
        {children}
      </div>
    </motion.section>
  );
}

export function RowItem({ children, width = "w-36" }: { children: ReactNode; width?: string }) {
  return <div className={`${width} shrink-0`}>{children}</div>;
}
