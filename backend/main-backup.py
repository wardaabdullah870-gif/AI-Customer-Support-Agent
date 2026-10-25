
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from groq import Groq, APIError

from database import (
    initialize_database,
    find_order,
    create_support_request,
    get_all_support_requests,
    update_support_request_status,
)

# Load environment variables from the .env file.
load_dotenv()

# Initialize the existing SQLite database.
initialize_database()


app = FastAPI(
    title="AI Customer Support Agent",
    description="AI-powered customer support API",
    version="1.0.0",
)


# Allow the local React frontend to communicate with the backend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request models
class ChatRequest(BaseModel):
    message: str
    order_number: str | None = None
    customer_email: str | None = None


class OrderLookupRequest(BaseModel):
    order_number: str
    customer_email: str

class SupportRequest(BaseModel):
    customer_email: str
    request_type: str
    description: str
    order_number: str | None = None

class UpdateSupportStatusRequest(BaseModel):
    status: str

# Home endpoint
@app.get("/")
def home():
    return {
        "message": "AI Customer Support Agent API is running"
    }


# Health-check endpoint
@app.get("/health")
def health_check():
    return {"status": "healthy"}


# Direct order lookup endpoint
@app.post("/orders/lookup")
def lookup_order(request: OrderLookupRequest):
    order_number = request.order_number.strip().upper()
    customer_email = request.customer_email.strip().lower()

    if not order_number or not customer_email:
        raise HTTPException(
            status_code=400,
            detail="Order number and customer email are required.",
        )

    order = find_order(order_number, customer_email)

    if not order:
        raise HTTPException(
            status_code=404,
            detail=(
                "No matching order was found. "
                "Please check your order number and email."
            ),
        )

    return {"order": order}


# Main AI customer support chat endpoint
@app.post("/chat")
def chat(request: ChatRequest):
    message = request.message.strip()

    if not message:
        raise HTTPException(
            status_code=400,
            detail="Please enter a message.",
        )

    # Identify messages that appear to concern an order.
    message_lower = message.lower()

    order_question = any(
        word in message_lower
        for word in [
            "order",
            "delivery",
            "shipment",
            "tracking",
            "track my",
        ]
    )

    # If the customer asks about an order, use the database.
    # Never allow the AI model to invent order details.
    if order_question:
        if not request.order_number or not request.customer_email:
            return {
                "reply": (
                    "I can help check your order. Please enter both "
                    "your order number and the email address used "
                    "when placing the order."
                )
            }

        order_number = request.order_number.strip().upper()
        customer_email = request.customer_email.strip().lower()

        if not order_number or not customer_email:
            return {
                "reply": (
                    "Please provide both your order number "
                    "and customer email address."
                )
            }

        order = find_order(order_number, customer_email)

        if not order:
            return {
                "reply": (
                    "I couldn't find an order matching those details. "
                    "Please check your order number and email address."
                )
            }

        estimated_delivery = (
            order["estimated_delivery"] or "Not available"
        )

        return {
            "reply": (
                "Here are your order details:\n"
                f"Order number: {order['order_number']}\n"
                f"Product: {order['product_name']}\n"
                f"Status: {order['status']}\n"
                f"Estimated delivery: {estimated_delivery}"
            )
        }

    # Use the AI service for general support questions.
    api_key = os.getenv("GROQ_API_KEY")

    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="GROQ_API_KEY is missing from the .env file.",
        )

    system_prompt = """
You are a helpful, professional AI customer support assistant.

YOUR RESPONSIBILITIES:
- Answer customer questions politely and clearly.
- Explain the sample support policies below.
- Give practical guidance for damaged products.
- Help customers understand how to request returns and refunds.
- Ask clarifying questions when necessary.
- Never invent order details, company policies, or account information.
- Never claim that a refund, return, or other action has been approved
  or completed unless the system actually confirms it.
- If a customer needs an action that you cannot perform, explain
  the next step clearly.

SAMPLE SUPPORT POLICIES FOR THIS DEMONSTRATION:
1. Returns:
   Customers should contact the support team to request a return.
   Their eligibility must be confirmed by a support agent.

2. Damaged products:
   Customers should contact support and provide their order number
   and a description of the damage. They may be asked to provide
   photographs of the damaged item.

3. Refunds:
   Refund eligibility must be reviewed and confirmed by a human
   support agent. Never promise a refund or a specific amount.

4. Delivery:
   Actual order status and estimated delivery dates must come from
   the order database. Never guess these details.

5. Missing information:
   Clearly explain what information is unavailable instead of
   making up an answer.

IMPORTANT:
These are demonstration policies, not verified policies of a real
company. Do not invent return deadlines, shipping fees, refund
amounts, or contact details. Do not claim to have submitted a
complaint, return, or refund request.
"""

    try:
        client = Groq(api_key=api_key)

        completion = client.chat.completions.create(
            model="openai/gpt-oss-20b",
            messages=[
                {
                    "role": "system",
                    "content": system_prompt,
                },
                {
                    "role": "user",
                    "content": message,
                },
            ],
            max_tokens=500,
        )

        reply = completion.choices[0].message.content

        return {
            "customer_message": message,
            "reply": (
                reply
                or "I'm sorry, I couldn't generate a response."
            ),
        }

    except APIError:
        raise HTTPException(
            status_code=502,
            detail=(
                "The AI service returned an error. "
                "Check your API key, model availability, "
                "and Groq usage limits."
            ),
        )


@app.post("/support-requests")
def submit_support_request(request: SupportRequest):
    customer_email = request.customer_email.strip().lower()
    request_type = request.request_type.strip().lower()
    description = request.description.strip()

    allowed_types = {"complaint", "return", "damaged_product"}

    if not customer_email or "@" not in customer_email:
        raise HTTPException(
            status_code=400,
            detail="Please provide a valid customer email address.",
        )

    if request_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=(
                "Request type must be complaint, return, "
                "or damaged_product."
            ),
        )

    if not description:
        raise HTTPException(
            status_code=400,
            detail="Please describe your request.",
        )

    order_number = (
        request.order_number.strip().upper()
        if request.order_number
        else None
    )

    if order_number:
        order = find_order(order_number, customer_email)

        if not order:
            raise HTTPException(
                status_code=404,
                detail="No order matches that order number and email.",
            )

    result = create_support_request(
        customer_email=customer_email,
        request_type=request_type,
        description=description,
        order_number=order_number,
    )

    return {
        "message": (
            "Your support request has been recorded. "
            "This does not mean a return or refund has been approved."
        ),
        **result,
    }

@app.get("/support-requests")
def list_support_requests():
    return get_all_support_requests()


@app.patch("/support-requests/{request_id}")
def update_support_status(
    request_id: str,
    request: UpdateSupportStatusRequest,
):
    allowed_statuses = ["Open", "In Progress", "Resolved"]

    if request.status not in allowed_statuses:
        raise HTTPException(
            status_code=400,
            detail="Status must be Open, In Progress, or Resolved.",
        )

    updated = update_support_request_status(
        request_id,
        request.status,
    )

    if not updated:
        raise HTTPException(
            status_code=404,
            detail="Support request not found.",
        )

    return {
        "message": "Support request status updated successfully.",
        "request_id": request_id,
        "status": request.status,
    }