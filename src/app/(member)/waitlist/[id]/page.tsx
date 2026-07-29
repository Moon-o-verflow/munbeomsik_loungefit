import WaitlistOfferScreen from "./waitlist-offer-screen";

export default async function WaitlistOfferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WaitlistOfferScreen waitlistId={id} />;
}
