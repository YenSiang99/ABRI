import { Navigate, useParams } from "react-router-dom";

// /app/asks/:id -> /app/requests/:id.
//
// Its own component because <Navigate to> takes a string and the id only
// exists inside the render: a plain redirect element in App.jsx would have to
// hardcode a path with no :id in it, which is how a bookmarked link to one
// request quietly becomes a link to the board.
function RedirectAskToRequest() {
  const { id } = useParams();
  return <Navigate to={`/app/requests/${id}`} replace />;
}

export { RedirectAskToRequest };
