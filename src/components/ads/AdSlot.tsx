import SponsoredBanner from "@/components/sponsored/SponsoredBanner";
import AdsenseUnit from "./AdsenseUnit";
import { webUnit, type WebPlacement } from "@/lib/adnetwork";

type Sold = { headline: string; imageUrl: string; targetUrl: string };

/**
 * One ad placement on a server-rendered page.
 * 1. A seller-booked ad for this slot, if one is live (the platform's own paid inventory comes first);
 * 2. otherwise a Google AdSense unit, if AdSense is configured for this placement;
 * 3. otherwise nothing - never an empty box or a "your ad here" placeholder.
 */
export default function AdSlot({ sold = [], placement, max = 1, accent = "var(--link)", label = "Sponsored", className }: {
  sold?: Sold[]; placement: WebPlacement; max?: number; accent?: string; label?: string; className?: string;
}) {
  if (sold.length > 0) {
    return <>{sold.slice(0, max).map((a, i) => <SponsoredBanner key={i} ad={a} label={label} accent={accent} />)}</>;
  }
  const unit = webUnit(placement);
  return unit ? <AdsenseUnit client={unit.client} slot={unit.slot} className={className} /> : null;
}
