import { z } from "zod";
import { authErrorResponse, requireOwner } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const HoldingSchema = z.object({
  symbol: z.string().trim().toUpperCase().regex(/^[A-Z0-9.=-]{1,16}$/),
  quantity: z.number().finite().min(0),
  kind: z.enum(["stock", "crypto"]),
  name: z.string().trim().min(1).max(120).optional(),
});
const PortfolioSchema = z.object({ holdings: z.array(HoldingSchema).max(30) });

export async function GET() {
  try {
    const principal = await requireOwner();
    if (!isSupabaseConfigured()) return Response.json({ configured: false, holdings: [] });
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase!
      .from("portfolio_holdings")
      .select("quantity,cost_basis,assets!inner(symbol,name,kind)")
      .eq("owner_id", principal.ownerId)
      .order("updated_at");
    if (error) throw error;
    const holdings = (data ?? []).map((row) => {
      const asset = Array.isArray(row.assets) ? row.assets[0] : row.assets;
      return { symbol: asset.symbol, name: asset.name, kind: asset.kind, quantity: Number(row.quantity), costBasis: row.cost_basis == null ? null : Number(row.cost_basis) };
    });
    return Response.json({ configured: true, holdings });
  } catch (error) { return authErrorResponse(error); }
}

export async function PUT(request: Request) {
  try {
    const principal = await requireOwner();
    if (!isSupabaseConfigured()) return Response.json({ configured: false, saved: false });
    const parsed = PortfolioSchema.parse(await request.json());
    const supabase = await createSupabaseServerClient();
    const assetRows = parsed.holdings.map((holding) => ({
      owner_id: principal.ownerId,
      symbol: holding.symbol,
      name: holding.name ?? holding.symbol,
      kind: holding.kind,
    }));
    if (assetRows.length) {
      const { error } = await supabase!.from("assets").upsert(assetRows, { onConflict: "owner_id,kind,symbol" });
      if (error) throw error;
    }
    const { data: assets, error: assetsError } = await supabase!.from("assets").select("id,symbol,kind").eq("owner_id", principal.ownerId);
    if (assetsError) throw assetsError;
    const ids = new Map((assets ?? []).map((asset) => [`${asset.kind}:${asset.symbol}`, asset.id]));
    const holdings = parsed.holdings.map((holding) => ({ owner_id: principal.ownerId, asset_id: ids.get(`${holding.kind}:${holding.symbol}`)!, quantity: holding.quantity, updated_at: new Date().toISOString() }));
    const desiredIds = holdings.map((holding) => holding.asset_id);
    if (desiredIds.length) {
      const { error: deleteError } = await supabase!.from("portfolio_holdings").delete().eq("owner_id", principal.ownerId).not("asset_id", "in", `(${desiredIds.join(",")})`);
      if (deleteError) throw deleteError;
      const { error: upsertError } = await supabase!.from("portfolio_holdings").upsert(holdings, { onConflict: "owner_id,asset_id" });
      if (upsertError) throw upsertError;
    } else {
      const { error } = await supabase!.from("portfolio_holdings").delete().eq("owner_id", principal.ownerId);
      if (error) throw error;
    }
    return Response.json({ configured: true, saved: true, count: holdings.length });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: error.issues[0]?.message ?? "Invalid portfolio" }, { status: 400 });
    return authErrorResponse(error);
  }
}
