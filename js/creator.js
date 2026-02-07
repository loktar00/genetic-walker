export default class CreatorCanvas {
    constructor() {
        this.canvas = document.getElementById('creator-canvas');
        this.ctx = this.canvas.getContext('2d');

        this.addPoint = document.getElementById('add-point');
        this.addPoint.addEventListener('click', () => {
            this.setMode('addPoint');
            this.removeActive();
            this.addPoint.classList.add('active');
            this.tempPoints = [];
        });

        this.addConstraint = document.getElementById('add-constraint');
        this.addConstraint.addEventListener('click', () => {
            this.setMode('addConstraint');
            this.removeActive();
            this.addConstraint.classList.add('active');
            this.tempPoints = [];
        });

        this.addMuscle = document.getElementById('add-muscle');
        this.addMuscle.addEventListener('click', () => {
            this.setMode('addMuscle');
            this.removeActive();
            this.addMuscle.classList.add('active');
            this.tempPoints = [];
        });

        this.removePoint = document.getElementById('remove-point');
        this.removeConstraint = document.getElementById('remove-constraint');
        this.removeMuscle = document.getElementById('remove-muscle');

        this.mode = 'addPoint';

        this.canvas.addEventListener('click', this.draw.bind(this));

        this.points = [];
        this.contraints = [];
        this.muscles = [];

        this.tempPoints = [];
    }

    removeActive() {
        if (document.querySelector('.active')) {
            document.querySelector('.active').classList.remove('active');
        }
    }

    setMode(mode) {
        this.mode = mode;
    }

    draw(e) {
        const pointX = e.pageX - this.canvas.offsetLeft;
        const pointY = e.pageY - this.canvas.offsetTop;
        const ctx = this.ctx;

        switch (this.mode) {
            case 'addPoint':
                ctx.fillStyle = 'rgb(0,255,0)';
                ctx.beginPath();
                ctx.arc(pointX, pointY, 2, 0, Math.PI * 2);
                ctx.closePath();
                ctx.fill();
                this.points.push({ x: pointX, y: pointY });
                break;
            case 'addConstraint':
            case 'addMuscle': {
                let cDist = 9999;
                let dist = 0;
                let closestPoint = null;

                for (let p = 0; p < this.points.length; p++) {
                    const point = this.points[p];
                    dist = Math.sqrt((point.x - pointX) * (point.x - pointX) +
                        (point.y - pointY) * (point.y - pointY));

                    if (dist < cDist) {
                        cDist = dist;
                        closestPoint = point;
                    }
                }

                this.tempPoints.push(closestPoint);

                if (this.tempPoints.length === 2) {
                    if (this.mode === 'addConstraint') {
                        this.contraints.push({
                            pointA: this.tempPoints[0],
                            pointB: this.tempPoints[1]
                        });

                        ctx.strokeStyle = 'rgb(0,255,0)';
                    } else if (this.mode === 'addMuscle') {
                        this.muscles.push({
                            pointA: this.tempPoints[0],
                            pointB: this.tempPoints[1]
                        });

                        ctx.strokeStyle = 'rgb(255,0,0)';
                    }
                    ctx.beginPath();
                    ctx.moveTo(this.tempPoints[0].x, this.tempPoints[0].y);
                    ctx.lineTo(this.tempPoints[1].x, this.tempPoints[1].y);
                    ctx.closePath();
                    ctx.stroke();

                    this.tempPoints = [];
                }
                break;
            }
            case 'removePoint':
                break;
            case 'removeConstraint':
                break;
            case 'removeMuscle':
                break;
        }
    }
}
