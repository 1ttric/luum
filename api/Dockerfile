FROM python:3
WORKDIR /app/src
COPY . .

RUN pip install -r requirements.txt

RUN useradd -m app
USER app
EXPOSE 3001
CMD ["gunicorn", "--chdir", "api", "-b", "0.0.0.0:3001", "app:app"]