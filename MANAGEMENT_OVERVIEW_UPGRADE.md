# PADEL ON — Management Overview, Alerts, Financial Report & Global Search

This update adds four staff-facing workflows without changing transaction tables or modifying any client records.

## 1. Club-wide Overview

**Overview** retains the original weekly team allowance metrics and game activity. It now also shows:

- **Today's private coaching sessions**, based on the recorded `entry_date`.
- **Cash received today**, composed of money paid at private sessions, separate prepaid client top-ups, cafeteria payments, and matchmaking collections.
- **Current outstanding cafeteria debts** and **current outstanding private coaching balances**, shown independently.
- **Unpaid monthly matchmaking commissions** according to the existing paid/unpaid settlement status.
- Links to daily private coaching, debt accounts, and matchmaking records.

Daily figures use Beirut local dates. Missing or inaccessible data displays **—** instead of silently assuming zero. Data is loaded using the existing staff-authenticated Supabase API.

## 2. Management Alerts

Overview alerts include:

- Cafeteria or private coaching accounts above the configured high-owed threshold.
- Inactive clients/accounts that still owe money.
- Active Rising Stars members who have not used their monthly free training entitlement.

Monthly training reminders become visually more urgent in the final seven days of the month. Alerts link to the relevant account or training page. More than seven alerts can be expanded with **Show all**.

Thresholds are currently set in the frontend source and are not synchronized across different settings; do not treat them as automatic payment collection or account modifications.

## 3. Consolidated Monthly Financial Report

Open **Reports → Monthly report → Club financial overview**. The consolidated report distinguishes:

| Financial concept | Meaning |
| --- | --- |
| Private session charges | Recorded coaching service values, not necessarily paid |
| Amount paid at sessions | Money received at private sessions |
| Private client top-ups | Cash received as prepaid credit, not new session revenue |
| Cafeteria purchases charged | Value of cafeteria purchases placed on accounts |
| Cafeteria payments | Cash received on cafeteria balances |
| Matchmaking collections | Money collected in the matchmaker ledgers |
| Matchmaking commissions | Payment obligation, not another receipt |
| Cash collected across operations | Session payments + private top-ups + cafeteria payments + matchmaking collections |

The report also includes **current outstanding debt and prepaid credit** for both client ledgers. These are clearly identified as **live balances**, *not historical month-end snapshots*.

CSV exports include the consolidated metrics and label missing data as **Not loaded**. The original weekly and matchmaking-specific reports remain available.

## 4. Global Search

The **Search** icon in the top bar opens global search; **Ctrl+K** or **Cmd+K** works on supported desktop browsers.

You can search across:

- Team members (name and team category)
- Private Sessions clients (name and existing customer ID)
- Cafeteria account holders
- Other Benefits players

Results are linked to the right page and account. Client directories load on demand after authentication. The search excludes soft-removed accounts; records remain preserved in Supabase. Staff must already have access according to the existing Supabase RLS policies.

## Setup and validation

**No new SQL migration is needed for these four features**. They rely on the existing PADEL ON database migrations for private coaching, cafeteria debts, matchmakers, training attendance and approved staff roles.

Before daily use, verify:

1. Overview renders today's sessions and recent financial amounts correctly against known entries.
2. An account with a high balance produces an alert and the alert opens the correct record.
3. An inactive account that still owes money appears in alerts.
4. Monthly training attendance prevents a member from being listed as untrained after attendance is recorded.
5. Monthly financial CSV agrees with its source ledgers and does not add service charges to payments as if both were cash received.
6. Global search finds a member, private client by numeric ID, cafeteria account and Other Benefits player.
7. Global search is inaccessible when signed out and the 6-hour inactivity logout remains active.
8. Existing week resets, Private Sessions and Cafeteria transactions continue working unchanged.

A live browser and Supabase authorization test is still recommended; code-level tests do not validate your actual hosted RLS deployment.
