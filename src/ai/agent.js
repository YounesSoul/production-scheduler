import store from '../data/store';
import { supabase } from '../data/supabase';

// Helper to format the current factory state into a concise string for the AI
function getFactoryContext() {
    const piecesPerDay = store.piecesPerDay;

    // Format orders compactly
    const orderSummary = store.orders.map(o =>
        `[${o.id}] Client: ${o.client}, Qty: ${o.quantity}, Arr: ${o.arrivalDate}, Del: ${o.deliveryDate}, Dur: ${o.duration}d, Chain: ${o.lockedChain || 'Any'}`
    ).join('\n');

    // Format schedule compactly
    const scheduleSummary = store.schedule.map(s =>
        `Order ${s.orderId} -> ${s.chain} (${s.startDate} to ${s.endDate}) [${s.duration}d]`
    ).join('\n');

    return `
--- CURRENT FACTORY STATE ---
Factory Setup: 8 Chains (CH1 to CH8)
Average Production Rate: ${piecesPerDay} pieces/day/chain

ORDERS (${store.orders.length}):
${orderSummary || 'No orders.'}

CURRENT SCHEDULE (${store.schedule.length} entries):
${scheduleSummary || 'No schedule generated.'}
-----------------------------
`;
}

export async function askAgent(userMessage, messageHistory = []) {
    const context = getFactoryContext();

    const systemPrompt = `You are an expert production scheduling assistant for a textile factory. 
You act as a friendly, concise, and highly analytical AI.
Your job is to answer questions about the factory's schedule, predict outcomes, and suggest optimal scheduling decisions.

Here is the current state of the factory:
${context}

Rules:
1. Base your answers strictly on the provided factory state.
2. Be concise. Use bullet points where appropriate.
3. Factory Setup: 8 Chains total (CH1 to CH8). Average production rate is ${store.piecesPerDay} pieces/day per chain.
4. Routing Rules: 
   - Client "Maxmara" and "CEHP" MUST ONLY be routed to CH1 or CH2.
   - Piece Types "Pantalon" and "Robe" MUST ONLY be routed to CH1, CH2, CH6, or CH7.
5. "What if" Questions: If the user asks where to add an order, calculate the required duration (Quantity / Production Rate). Look for gaps in the eligible schedule chains where it might fit BEFORE the delivery date. Earliest deadlines have top priority.
6. Splitting Orders: If a large order cannot fit on a single eligible chain before its delivery date, suggest splitting its quantity across 2 or 3 eligible chains to run in parallel.
7. If there is an issue (e.g., an order will miss its delivery date even with splitting), point it out proactively.`;

    // Construct the message array
    const messages = [
        { role: 'system', content: systemPrompt },
        ...messageHistory,
        { role: 'user', content: userMessage }
    ];

    try {
        // Call our secure Supabase Edge Function
        const { data, error } = await supabase.functions.invoke('chat', {
            body: { messages }
        });

        if (error) {
            console.error("Supabase Edge Function Error:", error);
            throw new Error("Failed to communicate with AI.");
        }

        if (data && data.choices && data.choices.length > 0) {
            return data.choices[0].message.content;
        } else {
            throw new Error("Invalid response format from AI.");
        }

    } catch (error) {
        console.error("Agent Error:", error);
        return "Sorry, I am having trouble connecting to my brain right now. Please make sure the 'chat' Edge Function is deployed and the OPENAI_API_KEY is set.";
    }
}
