import { requireStore } from "@/lib/tenant";
import AdsView from "@/components/dashboard/AdsView";
import AdsServicesView from "@/components/dashboard/AdsServicesView";
import { servicesEnabled } from "@/lib/bff/client";
import { adSlotsViaServices, storeBookingsViaServices } from "@/lib/bff/ads";
import { bookAd, cancelAd } from "./actions";

export const dynamic = "force-dynamic";

const day = (offset: number) => new Date(Date.now() + 6 * 3600_000 + offset * 86_400_000).toISOString().slice(0, 10); // Dhaka calendar day

export default async function AdManagerPage({ searchParams }: { searchParams?: { error?: string; booked?: string; cancelled?: string } }) {
  const store = await requireStore();

  if (servicesEnabled()) {
    const [slots, bookings] = await Promise.all([adSlotsViaServices(), storeBookingsViaServices(store.id)]);
    return (
      <AdsServicesView
        slots={slots}
        bookings={bookings}
        storeSlug={store.slug}
        minDate={day(1)}
        defaultEnd={day(7)}
        error={searchParams?.error}
        booked={searchParams?.booked}
        cancelled={!!searchParams?.cancelled}
        bookAction={bookAd}
        cancelAction={cancelAd}
      />
    );
  }

  return <AdsView storeSlug={store.slug} />;
}
