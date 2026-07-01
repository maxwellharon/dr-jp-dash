// api/wix-data.js
export default async function handler(req, res) {
    const { WIX_API_KEY, WIX_ACCOUNT_ID, WIX_SITE_ID } = process.env;

    // Fail loudly instead of silently returning empty data when
    // credentials aren't configured on this deployment.
    if (!WIX_API_KEY || !WIX_ACCOUNT_ID || !WIX_SITE_ID) {
        console.error('❌ Missing Wix credentials in environment', {
            hasApiKey: !!WIX_API_KEY,
            hasAccountId: !!WIX_ACCOUNT_ID,
            hasSiteId: !!WIX_SITE_ID
        });
        return res.status(500).json({
            error: 'Wix credentials are not configured on this deployment. Add WIX_API_KEY, WIX_ACCOUNT_ID and WIX_SITE_ID under Project → Settings → Environment Variables in Vercel, then redeploy.'
        });
    }

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': WIX_API_KEY,
        'wix-account-id': WIX_ACCOUNT_ID,
        'wix-site-id': WIX_SITE_ID
    };

    const { method } = req;
    const { collection, id, limit } = req.query;

    if (!collection) {
        return res.status(400).json({ error: 'Missing collection parameter' });
    }

    try {
        // GET – query collection
        if (method === 'GET') {
            const pageLimit = Math.min(parseInt(limit, 10) || 1000, 1000);
            const response = await fetch('https://www.wixapis.com/wix-data/v1/items/query', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    dataCollectionId: collection,
                    query: { paging: { limit: pageLimit, offset: 0 } }
                })
            });
            const data = await response.json();
            if (!response.ok) {
                console.error(`❌ Wix query failed for "${collection}" (${response.status}):`, JSON.stringify(data));
            }
            return res.status(response.ok ? 200 : 400).json(data);
        }

        // POST – single insert
        else if (method === 'POST') {
            const body = req.body;
            if (!body?.item) {
                return res.status(400).json({ error: 'Missing item in body' });
            }
            const response = await fetch('https://www.wixapis.com/wix-data/v1/items', {
                method: 'POST',
                headers,
                body: JSON.stringify({ dataCollectionId: collection, dataItem: body.item })
            });
            const data = await response.json();
            if (!response.ok) {
                console.error(`❌ Wix insert failed for "${collection}" (${response.status}):`, JSON.stringify(data));
            }
            return res.status(response.ok ? 200 : 400).json(data);
        }

        // PUT – update a single item (requires id)
        else if (method === 'PUT') {
            if (!id) {
                return res.status(400).json({ error: 'Missing id parameter for update' });
            }
            const updateBody = { dataItem: { _id: id, ...req.body } };
            const response = await fetch(`https://www.wixapis.com/wix-data/v1/items/${id}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify(updateBody)
            });
            const data = await response.json();
            if (!response.ok) {
                console.error(`❌ Wix update failed for "${collection}"/${id} (${response.status}):`, JSON.stringify(data));
                return res.status(response.status).json(data);
            }
            return res.status(200).json(data);
        }

        // DELETE
        else if (method === 'DELETE') {
            if (!id) {
                return res.status(400).json({ error: 'Missing id parameter' });
            }
            const response = await fetch(`https://www.wixapis.com/wix-data/v1/items/${id}`, {
                method: 'DELETE',
                headers
            });
            if (response.ok) {
                return res.status(200).json({ success: true });
            }
            const err = await response.json();
            console.error(`❌ Wix delete failed for "${collection}"/${id} (${response.status}):`, JSON.stringify(err));
            return res.status(response.status).json(err);
        }

        // PATCH – bulk insert
        else if (method === 'PATCH') {
            const body = req.body;
            if (!body?.items || !Array.isArray(body.items)) {
                return res.status(400).json({ error: 'Missing items array' });
            }
            const response = await fetch('https://www.wixapis.com/wix-data/v1/bulk/items/insert', {
                method: 'POST',
                headers,
                body: JSON.stringify({ dataCollectionId: collection, dataItems: body.items })
            });
            const data = await response.json();
            if (!response.ok) {
                console.error(`❌ Wix bulk insert failed for "${collection}" (${response.status}):`, JSON.stringify(data));
            }
            return res.status(response.ok ? 200 : 400).json(data);
        }

        else {
            return res.status(405).json({ error: 'Method not allowed' });
        }
    } catch (error) {
        console.error('❌ Wix proxy error:', error);
        return res.status(500).json({ error: error.message });
    }
}