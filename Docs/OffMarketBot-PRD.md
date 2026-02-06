# OffMarket Bot: Collective Intelligence for Real Estate Teams

## 1. What

OffMarket Bot is a "collective second brain" designed for real estate teams to capture and organize "off-market" intelligence. This intelligence is collected by agents in the team through in-person meetings with other agents, text messages or phone calls.

Agents will report these conversations in Slack when they can by typing out what they heard in the Offmarket Slack channel or forwarding a screenshot of their text conversation. Within the Slack Channel, there can be a conversation among the team about a specific piece of information.

The goal of this Bot is to collect all the information in the OffMarket Slack channel, centralize it in a datastore (potentially Firebase) so that it can be used to answer questions later or find relationships among entities etc.

The Bot will become a queryable system, ensuring that high-value opportunities shared in the field are never lost and can be instantly matched with client needs.

We want the Bot to create a collective memory that is continuously updated, new relationships added on the fly.

## 2. Who

OffMarket Bot is designed for specialized teams within a real estate firm, specifically:

- **Listing Agents**: To share early-stage intel on properties they are preparing to bring to market.
- **Buyer Agents**: To query for upcoming inventory that hasn't hit public databases yet.
- **Team Leads (e.g., Ruth's Team)**: To maintain a high-level view of the team's collective market knowledge and property pipeline.

## 3. Why

The "off-market" sector relies heavily on informal networks, text messages, and verbal messages, leading to "lossy" and unorganized data. Agents at the same team share what they remember on internal networks like Slack. Unfortunately, since this information is not properly stored and organized, Agents have to rely on their own memory.

Having such a Bot will allow Agents to find opportunities they could not do before and serve their clients better. This leads to increased productivity and business.

## 4. Current Market Gap: Why Existing Solutions Fail

- **Requirement for Precision**: Traditional CRMs require a full address and structured data to create a record. Off-market intel is often too vague (neighborhood + price) for these systems.
- **High Friction**: Agents sharing intel in Slack don't want to stop to fill out a CRM form.
- **Siloed Knowledge**: Valuable tips shared between two agents are often invisible to the rest of the team.

## 5. Key Entities

- **Intel Fragments**: Unstructured bits of information about properties, budgets, or neighborhood trends.
- **Agents**: The source of the intel (e.g., Joe, Sam, or Ruth).
- **Neighborhoods/Locations**: Contextual areas (e.g., "Van Ness and Geary") used for matching even when a specific address is missing.
- **HomeMatcher Profiles**: Buyer preferences used to cross-reference with incoming intel.

## 6. Functional Requirements

### 6.1. Multi-Channel Intel Capture

- **Slack Integration**: Automatically monitor the team's Slack channel to extract and store property fragments. The information is in text messages in the Slack channel and images posted to the channel. The images need to be scanned for the text information within them.
- **Fragment Memory**: Ability to store "unspecified" data points like price, bedroom count, and general location without requiring a full address.

### 6.2. Association Engine

- **Entity Linking**: Automatically associate a piece of intel with the reporting Agent, the Neighborhood, and potential Clients.
- **Updating data**: Automatically update the memory based on new information.

### 6.3. Natural Language Querying

- **Aggregated Reporting**: Agents can ask the bot questions like, "What properties are coming on soon in the $6M range?" and receive a summary based on multiple sources (e.g., "3 properties found based on info from Joe and Sam").

### 6.4. HomeMatcher Integration

- **Proactive Matching**: Push relevant off-market intel to HomeMatcher to alert agents when a buyer's criteria match an upcoming property.

## 7. User Journey: A Day with OffMarket Bot

- **10:00 AM (Field Intelligence)**: Joe posts in the team Slack: "Just met a seller at Van Ness and Geary, 4BR likely hitting in April for ~$6M." OffMarket Bot automatically logs this fragment.
- **1:00 PM (Agent Query)**: Ruth is meeting a high-budget client and asks the bot: "Any $6M properties coming up?" The bot replies with Joe's fragment and another tip from Sam.
- **3:00 PM (Automated Match)**: The bot identifies a buyer in HomeMatcher looking for large condos and notifies the assigned agent about Joe's upcoming listing.

## 8. Non-Functional Requirements

- **Privacy & Attribution**: Ensure every piece of intel is correctly attributed to the source agent to manage commissions and reputations.
- **Low Latency**: Intel should be searchable within seconds of being shared in Slack.
