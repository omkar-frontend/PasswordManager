import { useLottie } from "lottie-react";
import animationData from "./noData.json";

/** Composition size from noData.json (`w` / `h`). */
const COMP_W = 400;
const COMP_H = 300;

type NoDataLottieProps = {
  className?: string;
  /**
   * Scales the animation up so the visible art fills the frame; the source file
   * has extra padding inside the comp, so values above 1 crop that dead space.
   */
  zoom?: number;
};

const NoDataLottie = ({ className, zoom = 1.45 }: NoDataLottieProps) => {
  const { View } = useLottie(
    {
      animationData,
      loop: true,
      autoplay: true,
    },
    {
      width: COMP_W,
      height: COMP_H,
    }
  );

  return (
    <div
      className={`relative flex aspect-4/3 w-52 max-w-full shrink-0 items-center justify-center overflow-hidden ${className ?? ""}`}
    >
      <div
        className="shrink-0"
        style={{
          transform: `scale(${zoom})`,
          transformOrigin: "center center",
        }}
      >
        {View}
      </div>
    </div>
  );
};

export default NoDataLottie;
