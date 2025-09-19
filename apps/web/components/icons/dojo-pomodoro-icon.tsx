import Image from "next/image";
import React from "react";

interface DojoPomodoreIconProps {
  size?: number;
  className?: string;
}

export default function DojoPomodoreIcon({
  size = 24,
  className = "",
}: DojoPomodoreIconProps) {
  return (
    <Image
      src="/icon-144x144.png"
      width={size}
      height={size}
      alt="Dojo Pomodoro Icon"
      className={className}
    />
  );
}
