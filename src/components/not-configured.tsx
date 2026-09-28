import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function NotConfigured() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Supabase isn’t connected yet</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p>
          Set <code>SUPABASE_URL</code> and <code>SUPABASE_SECRET_KEY</code> in <code>.env.local</code> (or in the
          Vercel project), then apply <code>supabase/migrations/0001_initial.sql</code>.
        </p>
      </CardContent>
    </Card>
  );
}
