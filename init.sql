-- XXX: the only operation we need is whether a point is inside a polygon/multipolygon. So, we don't need a geography. A geometry will be enough.
CREATE TABLE geometries(id VARCHAR(255) PRIMARY KEY, fullname VARCHAR(255), geom GEOMETRY, parent VARCHAR(255), level SMALLINT);
CREATE TABLE saves (id CHAR(12) PRIMARY KEY, geometries varchar(255)[]);
CREATE TABLE last_updated (timestamp TIMESTAMP WITH TIME ZONE);
CREATE UNIQUE INDEX one_row_only ON last_updated (( true ));
INSERT INTO last_updated (timestamp) VALUES (now());
