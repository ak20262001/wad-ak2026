# ElektroMarket

ElektroMarket is a lightweight web marketplace for electronics buyers and sellers. It includes a buyer dashboard for submitting purchase requests, a seller dashboard for browsing buyer requests and sending offers, and a PHP backend API for request and order processing.

## Live Pages

- Buyer page: https://elektromarket.wuaze.com/
- Seller page: https://elektromarket.wuaze.com/seller.html

## Overview

### Buyer Dashboard
- Submit electronics requests using natural language.
- View active offers, add items to cart, and checkout.
- Track order history and order totals.
- Profile setup for name and WhatsApp contact.

### Seller Dashboard
- Receive buyer requests in real time.
- Search and filter requests.
- Send offers with product price and contact details.
- Accept buyer orders and manage history.
- Profile setup for store name and WhatsApp number.

## Repository Structure

- `index.html` - Buyer-facing dashboard UI.
- `seller.html` - Seller-facing dashboard UI.
- `api.php` - Backend API for handling requests, offers, orders, and cart actions.
- `style.css` - Shared frontend styling.
- `assets/js/main.js` - Shared JavaScript logic for buyer and seller workflows.
- `uploads/` - File upload storage for seller product images.
- `smartstore.sql` - Database schema / SQL dump.

## Notes

- The backend connects to a MySQL database and exposes JSON endpoints through `api.php`.
- The buyer and seller dashboards use client-side storage for user profile settings.
- Leaflet and Tailwind CSS are used for the UI and location features.
